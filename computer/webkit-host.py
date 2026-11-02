import base64
import subprocess
import json
import os
import sys
import threading

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("WebKit", "6.0")
gi.require_version("Gdk", "4.0")
from gi.repository import Gdk, Gio, GLib, Gtk, WebKit

WIDTH = int(os.environ.get("COIL_BROWSER_WIDTH", "1280"))
HEIGHT = int(os.environ.get("COIL_BROWSER_HEIGHT", "800"))
PROFILE = os.environ.get("COIL_BROWSER_PROFILE", "/root/.browser-webkit")
CONSOLE_HANDLER = "coilConsole"
CONSOLE_BRIDGE = """
(() => {
  const send = (type, args) => {
    try {
      window.webkit.messageHandlers.coilConsole.postMessage(JSON.stringify({
        type,
        text: args.map((arg) => {
          if (typeof arg === 'string') return arg;
          try { return JSON.stringify(arg); } catch { return String(arg); }
        }).join(' '),
      }));
    } catch {}
  };
  for (const type of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[type].bind(console);
    console[type] = (...args) => { send(type, args); original(...args); };
  }
  addEventListener('error', (event) => send('error', [String(event.error && event.error.stack || event.message)]));
  addEventListener('unhandledrejection', (event) => send('error', [String(event.reason && event.reason.stack || event.reason)]));
})();
"""
X_KEYS = {
    "Enter": "Return",
    "Backspace": "BackSpace",
    "ArrowUp": "Up",
    "ArrowDown": "Down",
    "ArrowLeft": "Left",
    "ArrowRight": "Right",
    "PageUp": "Prior",
    "PageDown": "Next",
}

PROTOCOL_OUT = os.fdopen(int(os.environ.get("COIL_PROTOCOL_FD", "3")), "wb", buffering=0)
out_lock = threading.Lock()


def emit(message):
    data = (json.dumps(message) + "\0").encode()
    with out_lock:
        PROTOCOL_OUT.write(data)


class Host:
    def __init__(self, app):
        os.makedirs(PROFILE, exist_ok=True)
        self.session = WebKit.NetworkSession.new(
            os.path.join(PROFILE, "data"), os.path.join(PROFILE, "cache")
        )
        self.cookies = self.session.get_cookie_manager()
        self.cookies.set_persistent_storage(
            os.path.join(PROFILE, "cookies.sqlite"), WebKit.CookiePersistentStorage.SQLITE
        )
        content = WebKit.UserContentManager()
        content.add_script(
            WebKit.UserScript.new(
                CONSOLE_BRIDGE,
                WebKit.UserContentInjectedFrames.TOP_FRAME,
                WebKit.UserScriptInjectionTime.START,
                None,
                None,
            )
        )
        content.register_script_message_handler(CONSOLE_HANDLER, None)
        content.connect(f"script-message-received::{CONSOLE_HANDLER}", self.on_console)
        self.view = WebKit.WebView(network_session=self.session, user_content_manager=content)
        self.view.get_settings().set_enable_developer_extras(True)
        self.view.connect("load-changed", self.on_load_changed)
        self.view.connect("notify::title", lambda *_: self.emit_page())
        self.window = Gtk.ApplicationWindow(application=app, title="coil")
        self.window.set_default_size(WIDTH, HEIGHT)
        self.window.set_decorated(False)
        self.window.set_child(self.view)
        self.window.present()
        self.window.fullscreen()
        self.started = False
        self.pending_open = None
        self.view.connect("load-failed", self.on_load_failed)
        self.view.load_uri("about:blank")

    def page(self):
        return {"url": self.view.get_uri() or "about:blank", "title": self.view.get_title() or ""}

    def emit_page(self):
        emit({"method": "page", "params": self.page()})

    def on_load_changed(self, _view, event):
        if event == WebKit.LoadEvent.COMMITTED:
            self.emit_page()
        if event == WebKit.LoadEvent.FINISHED:
            if not self.started:
                self.started = True
                emit({"method": "ready", "params": self.page()})
                return
            self.emit_page()
            emit({"method": "load", "params": self.page()})
            if self.pending_open is not None:
                ident, self.pending_open = self.pending_open, None
                self.reply(ident, self.page())

    def on_load_failed(self, _view, _event, uri, error):
        if self.pending_open is None:
            return False
        if error.matches(WebKit.NetworkError.quark(), WebKit.NetworkError.CANCELLED):
            return False
        ident, self.pending_open = self.pending_open, None
        self.reply(ident, error=f"{uri}: {error.message}")
        return False

    def on_console(self, _manager, value):
        try:
            parsed = json.loads(value.to_string())
        except (TypeError, ValueError):
            parsed = {"type": "log", "text": str(value)}
        emit({"method": "console", "params": parsed})

    def reply(self, ident, result=None, error=None):
        message = {"id": ident}
        if error is None:
            message["result"] = result if result is not None else {}
        else:
            message["error"] = {"message": error}
        emit(message)

    def evaluate(self, ident, expression):
        def finished(view, task):
            try:
                value = view.evaluate_javascript_finish(task)
            except GLib.Error as error:
                self.reply(ident, error=error.message)
                return
            if value is None or value.is_undefined() or value.is_null():
                self.reply(ident, {"value": None})
                return
            text = value.to_json(0)
            self.reply(ident, {"value": json.loads(text) if text is not None else None})

        self.view.evaluate_javascript(expression, -1, None, None, None, finished)

    def screenshot(self, ident):
        def finished(view, task):
            try:
                texture = view.get_snapshot_finish(task)
            except GLib.Error as error:
                self.reply(ident, error=error.message)
                return
            png = texture.save_to_png_bytes().get_data()
            self.reply(ident, {"data": base64.b64encode(png).decode(), "format": "png"})

        self.view.get_snapshot(
            WebKit.SnapshotRegion.VISIBLE, WebKit.SnapshotOptions.NONE, None, finished
        )

    def get_cookies(self, ident):
        def finished(manager, task):
            try:
                found = manager.get_all_cookies_finish(task)
            except GLib.Error as error:
                self.reply(ident, error=error.message)
                return
            jar = []
            for cookie in found:
                expires = cookie.get_expires()
                jar.append(
                    {
                        "name": cookie.get_name(),
                        "value": cookie.get_value(),
                        "domain": cookie.get_domain(),
                        "path": cookie.get_path(),
                        "expires": expires.to_unix() if expires is not None else None,
                        "httpOnly": cookie.get_http_only(),
                        "secure": cookie.get_secure(),
                    }
                )
            self.reply(ident, {"cookies": jar})

        self.cookies.get_all_cookies(None, finished)

    def set_cookies(self, ident, jar):
        gi.require_version("Soup", "3.0")
        from gi.repository import Soup

        cookies = []
        for item in jar:
            cookie = Soup.Cookie.new(
                item["name"], item["value"], item["domain"], item.get("path") or "/", -1
            )
            if item.get("expires"):
                cookie.set_expires(GLib.DateTime.new_from_unix_utc(int(item["expires"])))
            cookie.set_http_only(bool(item.get("httpOnly")))
            cookie.set_secure(bool(item.get("secure")))
            cookies.append(cookie)

        def finished(manager, task):
            try:
                manager.replace_cookies_finish(task)
            except GLib.Error as error:
                self.reply(ident, error=error.message)
                return
            self.reply(ident, {"count": len(cookies)})

        self.cookies.replace_cookies(cookies, None, finished)

    def xdotool(self, ident, *args):
        result = subprocess.run(["xdotool", *args], capture_output=True, text=True)
        if result.returncode != 0:
            self.reply(ident, error=result.stderr.strip() or "xdotool failed")
        else:
            self.reply(ident)

    def finish_type(self, ident, view, task):
        try:
            inserted = view.evaluate_javascript_finish(task)
        except GLib.Error as error:
            self.reply(ident, error=error.message)
            return
        if inserted is None or not inserted.to_boolean():
            self.reply(ident, error="no editable element has focus")
            return
        self.reply(ident)

    def handle(self, message):
        ident = message.get("id")
        method = message.get("method")
        params = message.get("params") or {}
        if method == "open":
            self.pending_open = ident
            self.view.load_uri(params["url"])
        elif method == "evaluate":
            self.evaluate(ident, params["expression"])
        elif method == "screenshot":
            self.screenshot(ident)
        elif method == "back":
            self.view.go_back()
            self.reply(ident)
        elif method == "forward":
            self.view.go_forward()
            self.reply(ident)
        elif method == "reload":
            self.view.reload()
            self.reply(ident)
        elif method == "click":
            x, y = str(int(params["x"])), str(int(params["y"]))
            self.xdotool(ident, "mousemove", x, y, "click", "1")
        elif method == "scroll":
            button = "5" if params.get("dy", 0) > 0 else "4"
            clicks = str(max(1, abs(int(params.get("dy", 0))) // 100))
            x, y = str(int(params["x"])), str(int(params["y"]))
            self.xdotool(ident, "mousemove", x, y, "click", "--repeat", clicks, button)
        elif method == "key":
            self.xdotool(ident, "key", X_KEYS.get(params["key"], params["key"]))
        elif method == "type":
            self.view.evaluate_javascript(
                "document.execCommand('insertText', false, " + json.dumps(params["text"]) + ")",
                -1,
                None,
                None,
                None,
                lambda view, task: self.finish_type(ident, view, task),
            )
        elif method == "page":
            self.reply(ident, self.page())
        elif method == "getCookies":
            self.get_cookies(ident)
        elif method == "setCookies":
            self.set_cookies(ident, params.get("cookies") or [])
        else:
            self.reply(ident, error=f"unknown method {method}")


def read_commands(host):
    buffer = b""
    stream = sys.stdin.buffer
    while True:
        chunk = stream.read1(65536)
        if not chunk:
            GLib.idle_add(lambda: os._exit(0))
            return
        buffer += chunk
        while b"\0" in buffer:
            frame, buffer = buffer.split(b"\0", 1)
            if frame.strip():
                message = json.loads(frame)
                GLib.idle_add(lambda m=message: host.handle(m) and False)


def main():
    with open(os.environ.get("COIL_BROWSER_PIDFILE", "/tmp/coil-webkit.pid"), "w") as pidfile:
        pidfile.write(str(os.getpid()))
    app = Gtk.Application(application_id="dev.coil.webkit", flags=Gio.ApplicationFlags.NON_UNIQUE)

    def activate(application):
        host = Host(application)
        threading.Thread(target=read_commands, args=(host,), daemon=True).start()

    app.connect("activate", activate)
    app.run([])


if __name__ == "__main__":
    Gdk.set_allowed_backends("x11")
    main()

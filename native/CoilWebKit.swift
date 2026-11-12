import AppKit
import Network
import WebKit

final class Host: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  let window = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
    styleMask: [.titled, .closable, .resizable, .miniaturizable],
    backing: .buffered, defer: false)
  var view: WKWebView!
  var listener: NWListener!
  var loads: [CheckedContinuation<Void, Never>] = []

  func applicationDidFinishLaunching(_ note: Notification) {
    let config = WKWebViewConfiguration()
    config.applicationNameForUserAgent = "Version/26.4 Safari/605.1.15"
    config.websiteDataStore = WKWebsiteDataStore(forIdentifier: UUID(uuidString: "6F1C0D2A-9C3B-4E55-9B7A-C011C011C011")!)
    view = WKWebView(frame: window.contentView!.bounds, configuration: config)
    view.autoresizingMask = [.width, .height]
    view.navigationDelegate = self
    view.isInspectable = true
    window.contentView!.addSubview(view)
    window.title = "coil"
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    serve()
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    let waiting = loads
    loads = []
    waiting.forEach { $0.resume() }
  }

  func serve() {
    listener = try! NWListener(using: .tcp, on: 18800)
    listener.newConnectionHandler = { conn in
      conn.start(queue: .main)
      self.read(conn, Data())
    }
    listener.start(queue: .main)
  }

  func read(_ conn: NWConnection, _ sofar: Data) {
    conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { data, _, done, _ in
      var buffer = sofar
      if let data { buffer.append(data) }
      let marker = Data("\r\n\r\n".utf8)
      guard let split = buffer.range(of: marker) else {
        return done ? conn.cancel() : self.read(conn, buffer)
      }
      let head = String(decoding: buffer[..<split.lowerBound], as: UTF8.self)
      let length = head.split(separator: "\r\n")
        .first { $0.lowercased().hasPrefix("content-length:") }
        .flatMap { Int($0.split(separator: ":")[1].trimmingCharacters(in: .whitespaces)) } ?? 0
      let body = buffer[split.upperBound...]
      if body.count < length && !done { return self.read(conn, buffer) }
      let path = head.split(separator: " ").dropFirst().first.map(String.init) ?? "/"
      let text = String(decoding: body, as: UTF8.self)
      Task { @MainActor in
        let reply = await self.handle(path: path, body: text)
        let bytes = Data(reply.utf8)
        let top = "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: \(bytes.count)\r\nconnection: close\r\n\r\n"
        conn.send(content: Data(top.utf8) + bytes, completion: .contentProcessed { _ in conn.cancel() })
      }
    }
  }

  @MainActor
  func handle(path: String, body: String) async -> String {
    switch path {
    case "/open":
      guard let url = URL(string: body.trimmingCharacters(in: .whitespacesAndNewlines)) else { return #"{"error":"bad url"}"# }
      await withCheckedContinuation { done in
        loads.append(done)
        view.load(URLRequest(url: url))
      }
      return json(["url": view.url?.absoluteString ?? "", "title": view.title ?? ""])
    case "/eval":
      do {
        let value = try await view.evaluateJavaScript(body)
        return json(["value": String(describing: value ?? "null")])
      } catch {
        return json(["error": error.localizedDescription])
      }
    case "/cookies":
      guard let data = body.data(using: .utf8),
            let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return #"{"error":"bad cookies"}"# }
      let store = view.configuration.websiteDataStore.httpCookieStore
      var set = 0
      for item in list {
        var props: [HTTPCookiePropertyKey: Any] = [
          .name: item["name"] as? String ?? "",
          .value: item["value"] as? String ?? "",
          .domain: item["domain"] as? String ?? "",
          .path: item["path"] as? String ?? "/",
        ]
        if (item["secure"] as? Bool) == true { props[.secure] = "TRUE" }
        if let expires = item["expires"] as? Double, expires > 0 { props[.expires] = Date(timeIntervalSince1970: expires) }
        if let cookie = HTTPCookie(properties: props) {
          await store.setCookie(cookie)
          set += 1
        }
      }
      return json(["set": String(set)])
    case "/screenshot":
      let image = try? await view.takeSnapshot(configuration: nil)
      guard let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
            let png = rep.representation(using: .png, properties: [:]) else { return #"{"error":"no snapshot"}"# }
      let file = "/tmp/coil-native-shot.png"
      try? png.write(to: URL(fileURLWithPath: file))
      return json(["path": file, "bytes": String(png.count)])
    default:
      return json(["url": view.url?.absoluteString ?? "", "title": view.title ?? ""])
    }
  }

  func json(_ value: [String: String]) -> String {
    String(data: try! JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
  }
}

let app = NSApplication.shared
let host = Host()
app.delegate = host
app.setActivationPolicy(.regular)
app.run()

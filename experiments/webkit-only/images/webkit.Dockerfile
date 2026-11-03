FROM coil-browser-base
RUN apk add --no-cache webkit2gtk-6.0 py3-gobject3 dbus dbus-x11 mesa-gles mesa-dri-gallium glib-networking ca-certificates

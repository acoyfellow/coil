FROM docker.io/library/alpine:3.22
RUN sed -i 's/https/http/' /etc/apk/repositories && apk add --no-cache bash font-noto xvfb x11vnc openbox xdotool python3 procps
RUN apk add --no-cache nodejs npm && npm i -g tsx@4 >/dev/null 2>&1
RUN apk add --no-cache ca-certificates && ln -sf /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-bundle.crt

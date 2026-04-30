FROM alpine:3.20
RUN apk add --no-cache curl tzdata && \
    ln -sf /usr/share/zoneinfo/Europe/Paris /etc/localtime && \
    echo "Europe/Paris" > /etc/timezone
ENV TZ=Europe/Paris
COPY crontab /crontab.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]

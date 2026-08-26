FROM nginx:1.28-alpine

RUN apk add --no-cache gettext \
  && mkdir -p /tmp/nginx/cache /tmp/nginx/run \
  && chown -R nginx:nginx /tmp/nginx

COPY --chown=nginx:nginx deploy/production/nginx/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --chown=nginx:nginx deploy/production/nginx/start-nginx.sh /usr/local/bin/start-nginx

USER nginx
EXPOSE 8080 8443
ENTRYPOINT ["/usr/local/bin/start-nginx"]

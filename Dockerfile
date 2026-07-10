FROM node:alpine AS build

WORKDIR /src

COPY . /src

# Build a production-only copy so the source tree remains useful for local
# development and the final image contains no unminified source assets.
RUN npm install --global --no-audit --no-fund --no-update-notifier \
        terser@5.49.0 clean-css-cli@5.6.3 html-minifier-terser@7.2.0 \
    && mkdir -p /src/dist/css /src/dist/js \
    && find css -type f -name '*.css' -exec sh -c 'for file do target="/src/dist/$file"; mkdir -p "$(dirname "$target")"; cleancss -O 1 --output "$target" "$file"; done' sh {} + \
    && find js -type f -name '*.js' -exec sh -c 'for file do target="/src/dist/$file"; mkdir -p "$(dirname "$target")"; terser "$file" --compress --mangle --comments false --output "$target"; done' sh {} + \
    && find . -maxdepth 1 -type f -name '*.html' -exec sh -c 'for file do target="/src/dist/$file"; html-minifier-terser --collapse-whitespace --remove-comments --remove-redundant-attributes --use-short-doctype --minify-css=true --minify-js=true "$file" --output "$target"; done' sh {} + \
    && cp -R assets /src/dist/assets

FROM nginx:alpine-slim AS final

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

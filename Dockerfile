FROM node:alpine AS build

WORKDIR /src

COPY . /src

# Install terser to minify JS files
RUN npm install -g terser
RUN if [ -d "js" ]; then find js -type f -name "*.js" -exec sh -c 'for f; do terser "$f" -c -m -o "$f"; done' sh {} +; fi

FROM nginx:alpine-slim AS final

COPY nginx.conf /etc/nginx/nginx.conf
COPY . /usr/share/nginx/html
COPY --from=build /src/js /usr/share/nginx/html/js

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
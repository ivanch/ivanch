FROM nginx:alpine-slim

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy website files
COPY . /usr/share/nginx/html

# Copy minify script and make it executable
COPY ./utils/minify.sh /tmp/minify.sh
RUN chmod +x /tmp/minify.sh

# Minify all JavaScript files in-place
RUN find /usr/share/nginx/html -name "*.js" -type f -exec sh /tmp/minify.sh {} \; && \
    rm -r /tmp && \
    rm -r /usr/share/nginx/html/.git && \
    rm -r /usr/share/nginx/html/utils

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
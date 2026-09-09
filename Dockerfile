# Frontend stage — Node lives only here. The deploy host has no Node and
# does not need one; only the built assets cross into the next stage.
FROM node:20-alpine AS frontend
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Vite writes into ../src/main/resources/static, so give it that path.
RUN npm run build

FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY gradlew gradlew.bat ./
COPY gradle gradle
COPY build.gradle.kts settings.gradle.kts ./
COPY src src
# The built SPA becomes part of the jar, which is what makes this channel
# same-origin with its own API and therefore free of CORS.
COPY --from=frontend /src/main/resources/static ./src/main/resources/static
RUN chmod +x gradlew && ./gradlew bootJar --no-daemon -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8085
ENTRYPOINT ["java", "-jar", "app.jar"]

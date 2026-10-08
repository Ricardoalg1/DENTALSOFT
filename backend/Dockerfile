FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /build
COPY backend/.mvn backend/.mvn
COPY backend/mvnw backend/pom.xml backend/
RUN chmod +x backend/mvnw
COPY backend/src backend/src
RUN cd backend && ./mvnw -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache wget
RUN addgroup -S occlus && adduser -S occlus -G occlus
WORKDIR /app
COPY --from=build --chown=occlus:occlus /build/backend/target/occlus-backend-0.0.1-SNAPSHOT.jar app.jar
USER occlus
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]

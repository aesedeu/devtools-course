FROM golang:1.26-alpine AS build
WORKDIR /src
COPY main.go .
RUN go build -o /hello main.go

FROM scratch
COPY --from=build /hello /hello
CMD ["/hello"]

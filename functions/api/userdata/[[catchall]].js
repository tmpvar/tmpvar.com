const API_HOST = "app.posthog.com" // Change to "eu.posthog.com" for the EU region

async function handleRequest(event) {
    const pathname = (new URL(event.request.url).pathname).replace("/api/userdata", "");
    console.log("pathname:", pathname)
    if (pathname.startsWith("/static/")) {
        return retrieveStatic(event, pathname)
    } else {
        return forwardRequest(event, pathname)
    }
}

async function retrieveStatic(event, pathname) {
    let response = await caches.default.match(event.request)
    if (!response) {
        response = await fetch(`https://${API_HOST}${pathname}`)
        event.waitUntil(caches.default.put(event.request, response.clone()))
    }
    return response
}

async function forwardRequest(event, pathname) {
    const request = new Request(event.request)
    request.headers.delete("cookie")
    return await fetch(`https://${API_HOST}${pathname}`, request)
}

addEventListener("fetch", (event) => {
    event.passThroughOnException()
    event.respondWith(handleRequest(event))
})
const fastify = require("fastify")
const path = require("path")
require("dotenv").config()

const DEBUG = process.env.DEBUG_LOG === "true"

function debugLog(label, data) {
    if (!DEBUG) return
    const ts = new Date().toISOString()
    console.log(`\n[DEBUG ${ts}] ── ${label} ──`)
    if (data !== undefined) console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2))
}

global.__debugLog = debugLog
global.__DEBUG = DEBUG

const app = fastify({ trustProxy: true })

app.register(require("@fastify/static"), {
    root: path.join(__dirname, "public"),
    prefix: "/",
})

app.register(require("@fastify/rate-limit"), {
    max: 100,
    timeWindow: "1 minute"
})

app.register(require("@fastify/cors"), {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
})

if (DEBUG) {
    console.log("[DEBUG] Debug logging is ENABLED — all requests, headers, bodies, and upstream calls will be logged")

    app.addHook("onRequest", (request, reply, done) => {
        debugLog(`INBOUND ${request.method} ${request.url}`, {
            ip: request.ip,
            headers: request.headers,
        })
        done()
    })

    app.addHook("preHandler", (request, reply, done) => {
        if (request.body !== undefined) {
            debugLog(`REQUEST BODY ${request.method} ${request.url}`, request.body)
        }
        done()
    })

    app.addHook("onSend", (request, reply, payload, done) => {
        let parsed = payload
        if (typeof payload === "string") {
            try { parsed = JSON.parse(payload) } catch { parsed = payload }
        }
        debugLog(`RESPONSE ${request.method} ${request.url} → ${reply.statusCode}`, parsed)
        done(null, payload)
    })
}

app.get("/health", async (request, reply) => {
    return reply.status(200).reply("ok") // i sure fucking hope we're ok
})

// mount the routes.
// see here you'd expect me to make a childish joke revolving around my oshi
// like "mount the pippa"
// but i am a normal person who would never do that
// except for the fact i just thought of that
// fuck
app.register(require("./helpers/chatApi.js"))
app.register(require("./helpers/routes.js"))

app.listen({port: process.env.PORT || 3000}, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})
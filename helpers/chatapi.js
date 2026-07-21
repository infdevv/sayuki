const StorageAPI = require("./storage.js")
const { checkAndIncrementUsage } = StorageAPI
const { preprocess, countTokens } = require("./chatAPI/preprocessing.js")
const { scanChat }  = require("./chatAPI/mod.js")

const _reqStats = {
    total: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    recentTimestamps: [],
}

function _recordRequest() {
    _reqStats.total++
    const ts = Date.now()
    _reqStats.recentTimestamps.push(ts)
    const cutoff = ts - 60000
    _reqStats.recentTimestamps = _reqStats.recentTimestamps.filter(t => t >= cutoff)
}

function _recordTokens(input, output) {
    if (input)  _reqStats.totalInputTokens  += input
    if (output) _reqStats.totalOutputTokens += output
}

function getRequestStats() {
    const cutoff = Date.now() - 60000
    _reqStats.recentTimestamps = _reqStats.recentTimestamps.filter(t => t >= cutoff)
    const n = _reqStats.total
    return {
        requests: n,
        requestAverageInput:  n ? Math.round(_reqStats.totalInputTokens  / n) : 0,
        requestAverageOutput: n ? Math.round(_reqStats.totalOutputTokens / n) : 0,
        rpm: _reqStats.recentTimestamps.length,
    }
}

function makeError(message, code, type, status) {
  return { status, body: { error: { message, type, code, param: null } } }
}

const APP_ERRORS = {
  lorebary:         makeError("For safety and security concerns, Lorebary is not allowed to be used with Sayuki.", "lorebary_blocked",       "invalid_request_error", 400),
  no_api_key:       makeError("No API key provided.",                                                              "no_api_key",             "authentication_error",  401),
  invalid_api_key:  makeError("Invalid API key.",                                                                  "invalid_api_key",        "authentication_error",  401),
  rate_limit:       makeError("Rate limit exceeded for this provider. Try again after UTC midnight.",              "rate_limit_exceeded",    "rate_limit_error",      429),
  model_not_allowed:makeError("Model not allowed by this key.",                                                    "model_not_allowed",      "permission_error",      403),
  content_moderated:makeError("Your message was flagged by the content moderation system.",                        "content_moderated",      "invalid_request_error", 403),
}

function sendError(reply, err) {
  return reply.status(err.status).send(err.body)
}

function shuffledUpstreamKeys(value) {
  const keys = [...new Set(String(value ?? "").split(",").map(key => key.trim()).filter(Boolean))]
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[keys[i], keys[j]] = [keys[j], keys[i]]
  }
  return keys
}

function getUrlDiagnostics(value) {
  const raw = String(value ?? "")
  try {
    const parsed = new URL(raw)
    return {
      raw,
      isBlank: raw.trim().length === 0,
      protocol: parsed.protocol,
      host: parsed.host,
      pathname: parsed.pathname,
      search: parsed.search,
    }
  } catch (error) {
    return {
      raw,
      isBlank: raw.trim().length === 0,
      parseError: error.message,
    }
  }
}

module.exports = function (fastify, opts, done) {

  fastify.get("/v1/", async (request, reply) => {
    return reply.send(["/chat/completions", "models"])
  })

  fastify.get("/v1/models", async (request, reply) => {
    const apiKey = request.headers.authorization?.split(" ")[1] ?? null
    const modelList = StorageAPI.getModels(apiKey)

    return reply.send({
      object: "list",
      data: modelList.map(m => ({
        id: m.name,
        object: "model",
        created: 0,
        owned_by: m.owner
      }))
    })
  })

  fastify.get("/v1/chat/completions", function(request, reply) {
    return reply.status(405).send({
      error: { message: "Method Not Allowed", type: "invalid_request_error", code: "method_not_allowed", param: null }
    })
  })

  fastify.post("/v1/chat/completions", {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "1 minute",
      }
    }
  }, async function(request, reply) {

    if (JSON.stringify(request.body).includes("lorebary")) {
      return sendError(reply, APP_ERRORS.lorebary)
    }

    // strip tools
    request.body.tools = []

    if (request.headers.authorization == null) {
      return sendError(reply, APP_ERRORS.no_api_key)
    }

    const userKeyToken = request.headers.authorization.split(" ")[1]
    const masterKey = StorageAPI.validateKey(userKeyToken)

    if (masterKey === false) {
      return sendError(reply, APP_ERRORS.invalid_api_key)
    }

    if (!checkAndIncrementUsage(masterKey.masterKeyName, userKeyToken)) {
      return sendError(reply, APP_ERRORS.rate_limit)
    }

    if (masterKey.allowedModels.length > 0 && !masterKey.allowedModels.includes(request.body.model)) {
      return sendError(reply, APP_ERRORS.model_not_allowed)
    }

    request.body.messages = preprocess(
      request.body.messages,
      masterKey.lorebooks,
      masterKey.prompts,
      masterKey.plugins,
      masterKey.contextWindows[request.body.model],
      request.body.max_completion_tokens ?? request.body.max_tokens
    )

    if ((await scanChat(request.body.messages, masterKey.user, request.ip))["isFlagged"]) {
      return sendError(reply, APP_ERRORS.content_moderated)
    }

    const inputEstimate = Math.round(countTokens(request.body.messages))

    const proxyUrl = masterKey.useCloudflareWorker
      ? `https://ffproxy.sayuki-proxy.com/?target=${encodeURIComponent(masterKey.upstreamUrl)}`
      : masterKey.upstreamUrl
    const upstreamBody = JSON.stringify(request.body)
    const upstreamKeys = shuffledUpstreamKeys(masterKey.upstreamKey)
    const traceId = request.id
    let upstream = null
    let lastFetchError = null

    if (global.__DEBUG) {
      global.__debugLog("UPSTREAM REQUEST PREPARED", {
        traceId,
        masterKeyName: masterKey.masterKeyName,
        target: getUrlDiagnostics(masterKey.upstreamUrl),
        proxy: getUrlDiagnostics(proxyUrl),
        encodedTarget: encodeURIComponent(masterKey.upstreamUrl),
        configuredKeyCount: upstreamKeys.length,
        bodyBytes: Buffer.byteLength(upstreamBody),
      })
    }

    for (let i = 0; i < upstreamKeys.length; i++) {
      const upstreamHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${upstreamKeys[i]}`
      }
      if (masterKey.useCloudflareWorker) upstreamHeaders["X-Proxy-Token"] = "sayuki-proxy-forward-protection"

      if (global.__DEBUG) {
        global.__debugLog("UPSTREAM FETCH", {
          traceId,
          proxyUrl,
          targetUrl: masterKey.upstreamUrl,
          keyAttempt: i + 1,
          keyCount: upstreamKeys.length,
          headers: { ...upstreamHeaders, Authorization: "Bearer [REDACTED]" },
          body: request.body,
        })
      }

      try {
        upstream = await fetch(proxyUrl, {
          headers: upstreamHeaders,
          body: upstreamBody,
          method: "POST"
        })
        if (global.__DEBUG) {
          global.__debugLog("UPSTREAM FETCH RESULT", {
            traceId,
            keyAttempt: i + 1,
            status: upstream.status,
            statusText: upstream.statusText,
            ok: upstream.ok,
            responseUrl: upstream.url,
            redirected: upstream.redirected,
          })
        }
        if (upstream.ok || i === upstreamKeys.length - 1) break
        try { await upstream.body?.cancel() } catch (cancelError) {
          if (global.__DEBUG) global.__debugLog("UPSTREAM RESPONSE CANCEL FAILED", { traceId, message: cancelError.message })
        }
      } catch (error) {
        lastFetchError = error
        upstream = null
        if (global.__DEBUG) {
          global.__debugLog("UPSTREAM FETCH THREW", {
            traceId,
            keyAttempt: i + 1,
            name: error.name,
            message: error.message,
            cause: error.cause?.message,
            stack: error.stack,
          })
        }
      }
    }

    if (!upstream) {
      if (global.__DEBUG && lastFetchError) global.__debugLog("UPSTREAM FETCH FAILED", { traceId, message: lastFetchError.message })
      return reply.status(502).send({
        error: {
          message: "Could not reach the upstream provider with any configured API key.",
          type: "upstream_error",
          code: "upstream_unavailable",
          param: null,
          upstream_status: 502
        }
      })
    }

    if (global.__DEBUG) {
      const upstreamRespHeaders = {}
      upstream.headers.forEach((v, k) => { upstreamRespHeaders[k] = v })
      global.__debugLog(`UPSTREAM RESPONSE ${upstream.status}`, { traceId, headers: upstreamRespHeaders })
    }

    if (!upstream.ok) {
      const upstreamText = await upstream.text()
      if (global.__DEBUG) global.__debugLog("UPSTREAM ERROR RESPONSE BODY", { traceId, body: upstreamText })
      try {
        return reply.status(upstream.status).send(JSON.parse(upstreamText))
      } catch {
        return reply.status(upstream.status).send(upstreamText)
      }
    }

    _recordRequest()
    _recordTokens(inputEstimate, 0)

    if (request.body.stream === true) {
      const { Readable, Transform } = require("stream")
      reply.header("Content-Type", "text/event-stream")

      let outputLength = 0
      const interceptor = new Transform({
        transform(chunk, _enc, cb) {
          const lines = chunk.toString().split("\n")
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6).trim()
            if (payload === "[DONE]") continue
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content
              if (delta) outputLength += delta.length
            } catch {}
          }
          this.push(chunk)
          cb()
        },
        flush(cb) {
          _recordTokens(0, Math.round(outputLength / 3))
          cb()
        }
      })

      return reply.send(Readable.fromWeb(upstream.body).pipe(interceptor))
    } else {
      const responseBody = await upstream.json()
      const outputContent = responseBody?.choices?.[0]?.message?.content ?? ""
      _recordTokens(0, Math.round(outputContent.length / 3))
      if (global.__DEBUG) global.__debugLog("UPSTREAM RESPONSE BODY (non-stream)", responseBody)
      return reply.send(responseBody)
    }
  })

  done()
}

module.exports.getRequestStats = getRequestStats

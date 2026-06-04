const { random } = require("@huggingface/transformers")
const fs = require("fs")
const { mknctry_prompt, mknctry_reminder, mknctry_hard_reminder, mknctry_prompt_erp, mknctry_reminder_erp, mknctry_hard_reminder_erp } = require("./mknctry.js")

const _wordlistSet = new Set(
    fs.readFileSync(require("path").join(__dirname, "plugins", "words.txt"), "utf-8")
      .split("\n").map(w => w.trim().toLowerCase())
)


function countParagraphs(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Normalize line endings and trim
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (normalized.length === 0) {
    return 0;
  }

  // Split by double newlines (paragraph breaks)
  const paragraphs = normalized.split(/\n\s*\n+/);

  // Filter out empty or whitespace-only segments
  const validParagraphs = paragraphs.filter(para => {
    return para.trim().length > 0;
  });

  return validParagraphs.length;
}


const plugins = [
    {
        "name": "RandomNPC",
        "description": "Get random NPCs, randomly",
        "creator": "sayukiproxy"
    },
    {
        "name": "RandomEvent",
        "description": "Get random events, randomly (non-typical ones, avoid for serious RPs)",
        "creator": "sayukiproxy"
    },
    {
        "name": "Mesmerizer",
        "description": "Better memory! And an original totally never before used name that has everything to do with LLMs!",
        "creator": "sayukiproxy"
    },
    {
        "name": "Pippa of Doom",
        "description": "Random chance for Pipkin Pippa to brutally kill you",
        "creator": "sayukiproxy"
    },
    {
        "name": "MKNCTRY",
        "description": "MKNCTRY is the attempt at the ultimate RP plugin. Avoid using anys other plugins with MKNCTRY.",
        "creator": "sayukiproxy"
    },
    {
        "name": "Cache Buster",
        "description": "Stop caching, useful for Pollinations.",
        "creator": "sayukiproxy"
    },
    {
        "name": "MKNCTRY-ERP",
        "description": "𝓕𝓻𝓮𝓪𝓴𝔂 version of MKNCTRY. Lacks some of the features from MKNCTRY.  Avoid using with normal MKNCTRY or other plugins.",
        "creator": "sayukiproxy"
    }
]

const pluginMap = {
    "Cache Buster": function(conversations) {
        conversations[0].content += Math.random() * 100
        return conversations
    },
    "Pippa of Doom": function(conversations) {
        let weight = Math.random() * 100
        if (weight > 98) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, no matter what, introduce the Phase Connect Pipkin Pippa, Pippa will imeddiately kill the user and the assistant)"
        else if (weight > 96) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, no matter what, introduce the Phase Connect Pipkin Pippa, Pippa will imeddiately give the user a bottle of mountain dew and vanish)"
        return conversations
    },
    "RandomEvent": function(conversations) {
        let weight = Math.random() * 100
        let events = [
            "New world war happens",
            "Global pandemic",
            "Intercontinental ballistic missile hits 10 miles away",
            "Universal basic income happens for half a second",
            "Recession",
            "Micheal Jackson gets revived, releases Thriller 2.0, and dies again",
            "Saint Peter boxes Jake Paul on state television",
            "the USSR is revived",
            "it's now legally gay to breath",
            "CNN is hijacked and plays 10 hours of low quality chinese bootleg barbie phone music",
            "Homosexual racoon forceful seize of power",
            "Kanye West becomes President of the United States and or any adjacent superpower"
        ]
        if (weight > 95) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, if appropriate, introduce this event: " + events[Math.floor(Math.random() * events.length)] + ", ignore this if the setting is not right)"
        return conversations
    },
    "RandomNPC": function(conversations) {
        let weight = Math.random() * 100
        if (weight > 95) return conversations[conversations.length-1].content += "\n\n(OOC: In the next message, if appropriate, introduce an NPC, ignore this if the setting is not right)"
        return conversations
    },

    "Mesmerizer": function(conversations) {
      try {
        const SCAN_WINDOW = 40  // only look back this many messages
        const MAX_CANDIDATES = 20  // cap before reranker to avoid huge pairs array

        let newestMessage = conversations[conversations.length-1].content

        function normalize(text){
            return text.replace(/[`~!@#$%^&*()\-_+=\[\]{}|\\;:'"<>,./?]/g, "")
        }

        function isTitle(text){
            if (!text || text.length === 0) return false
            if (text[0] === text[0].toUpperCase() && text[text.length-1] != text[text.length-1].toUpperCase()) return true
            return false
        }

        let normalizedNewestMessage = normalize(newestMessage)
        let tokens = normalizedNewestMessage.split(" ") // for anyone reading this, tokenizers aren't a llm specific concept
        let properNouns = new Set()

        for (const token of tokens){
            if (!_wordlistSet.has(token.toLowerCase()) && isTitle(token)) properNouns.add(token)
        }

        if (properNouns.size === 0) return conversations

        // scan only the most recent SCAN_WINDOW messages, deduplicate by reference
        const scanStart = Math.max(0, conversations.length - 1 - SCAN_WINDOW)
        const seen = new Set()
        let triggerTerms = []

        for (let i = conversations.length-2; i >= scanStart; i--){
            const msg = conversations[i].content
            if (seen.has(msg)) continue

            let normalizedMessage = normalize(msg)
            let msgTokens = normalizedMessage.split(" ")

            for (const token of msgTokens){
                if (properNouns.has(token)){
                    seen.add(msg)
                    triggerTerms.push(msg)
                    break  // one match per message is enough
                }
            }

            if (triggerTerms.length >= MAX_CANDIDATES) break
        }

        if (triggerTerms.length === 0) return conversations

        conversations[conversations.length-1].content += "\n\n(OOC: System injections (automatically sourced from previous messages, do not mention this in your next response, you can use it to enrich your answer however):\n\n" + triggerTerms.slice(0, 5).join("==========\n") + ")"

        return conversations
      } catch (err) {
        console.error("[Mesmerizer] error, skipping plugin:", err.message)
        return conversations
      }
    },
    "MKNCTRY": function(conversations) {
        conversations = pluginMap["Mesmerizer"](conversations)
        // apply the prompt
        conversations[0].content += "\n\n" + mknctry_prompt

        // check that its following
        const prevContent = conversations.length >= 2 ? conversations[conversations.length-2].content : ""
        if (countParagraphs(prevContent) < 3) {
            conversations[conversations.length-1].content += `\n\n(OOC: ${mknctry_hard_reminder})`
        }
        else {
            conversations[conversations.length-1].content += `\n\n(OOC: ${mknctry_reminder})`
        }

        let weight = Math.random() * 100
        if (weight > 99) {
            conversations[conversations.length-1].content += "\n\n(OOC: In the next message, if appropriate, introduce the a NPC, ignore this if the setting is not right)"
        }
        // apply mesmerizer
        return conversations
    },
    "MKNCTRY-ERP": function(conversations) {
        conversations = pluginMap["Mesmerizer"](conversations)
        // apply the prompt
        conversations[0].content += "\n\n" + mknctry_prompt_erp

        // check that its following
        const prevContentErp = conversations.length >= 2 ? conversations[conversations.length-2].content : ""
        if (countParagraphs(prevContentErp) < 3) {
            conversations[conversations.length-1].content += `\n\n(OOC: ${mknctry_hard_reminder})`
        }
        else {
            conversations[conversations.length-1].content += `\n\n(OOC: ${mknctry_reminder_erp})`
        }
        
        // apply mesmerizer
        return conversations
    }
}

module.exports = { plugins, pluginMap }
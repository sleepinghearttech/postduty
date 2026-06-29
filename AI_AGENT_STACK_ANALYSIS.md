# AI Agent Stack — How it maps to PostDuty and the Business Hub

> Reference document based on the MachineLearningMastery 7-layer agent stack article.
> Last updated: 2026-06-30

---

## The 7 layers and where you already stand

| Layer | What it is | PostDuty status | Business Hub status |
|---|---|---|---|
| 1. Foundation Model | The LLM doing the reasoning | ✅ Done — Claude Sonnet 4.6 via Claude Code | ✅ Done — same, plus Claude API in artifacts |
| 2. Orchestration | Controls the agent loop and tool calls | 🔶 Partial — n8n planned, that IS this layer | 🔶 Partial — LangGraph is the future path |
| 3. Memory | Working, episodic, semantic, procedural | ✅ Done — Supabase orders = episodic; CLAUDE.md = procedural | 🔶 Partial — needs a conversations table in Supabase |
| 4. Vector DB / RAG | Semantic search over your own docs | 🔵 Future — pgvector on existing Supabase (zero new infra) | 🔵 Future — RAG over lectures, ICU guidelines, products |
| 5. Tools & MCP | External integrations the agent can call | ✅ Done — Supabase, Razorpay, Shiprocket already wired | ✅ Done — Gmail, Calendar, Notion, Drive MCP live |
| 6. Observability | Tracing, evaluation, hallucination detection | 🔵 Future — Langfuse free tier when AI features go live | 🔵 Future — same |
| 7. Deployment | Serving the agent at production scale | ✅ Done — Cloudflare Workers, serverless, auto-deploy | 🔶 Partial — same pipeline works, n8n for scheduled jobs |

✅ Done · 🔶 Partial / in progress · 🔵 Future (not yet needed)

---

## The key insight

You haven't been building just an e-commerce store.
You've been building a production AI agent stack — the store is the first agent that runs on it.

The stack you've built (Next.js + Supabase + Cloudflare + MCP tools + CLAUDE.md) is
architecturally identical to what this article describes. You just haven't used the vocabulary.

---

## What this changes for PostDuty

### Near-term (add after launch)
- **Semantic product search** — enable pgvector on your existing Supabase PostgreSQL
  (Settings → Extensions → pgvector, one click). Store product embeddings alongside
  product rows. Power a "find a gift for a cardiac nurse" search that understands meaning,
  not just keywords.
- **AI product descriptions** — when your partner adds a new product via the admin panel,
  a Claude API call auto-generates the description from the product name + supplier notes.
  Already have the Anthropic API available in artifacts — same pattern works server-side.

### Medium-term (after first 50 orders)
- **Order assistant** — a simple Claude-powered chatbot on the store that can answer
  "where is my order?" by querying Supabase, or "what should I buy for a nurse friend?"
  using RAG over the product catalogue. Customer-facing Layer 1–5 in one feature.

---

## What this changes for the Business Hub

The business hub is the right place to implement the full stack properly.
Think of it as a personal agent with access to all your tools.

### What it would do (concretely)
One prompt: "Morning briefing" →
- Checks PostDuty orders (Supabase tool)
- Flags anything needing shipping today
- Pulls your Cloudphysician schedule (Calendar MCP)
- Summarises any unread important emails (Gmail MCP)
- Shows Marrow lecture pipeline status (Notion MCP)
- Reports any portfolio moves worth noting (search tool)

All of this is possible with tools you already have connected.
The orchestration (LangGraph or even a smart n8n workflow) is the missing piece.

### The pgvector opportunity
Your Supabase database already runs PostgreSQL.
pgvector is a PostgreSQL extension — enable it with one click in Supabase dashboard.

This means you can store and query embeddings in the SAME database as your orders,
products, and users — no new infrastructure, no new bill, no new service to manage.

Use cases once enabled:
- Semantic search over Marrow lecture notes ("find my slide on TAVI complications")
- RAG over ICU antibiotic guidelines for the clinical decision tool
- Product recommendations on the PostDuty store
- Semantic search over your own past Claude conversations (the business hub memory)

---

## Recommended reading order for the tools mentioned

1. **MCP (Model Context Protocol)** — already using it. Read:
   https://modelcontextprotocol.io/
   Understand why it's Layer 5 and how to build your own MCP server for PostDuty data.

2. **LangGraph** — the orchestration framework for the business hub:
   https://langchain-ai.github.io/langgraph/
   Start with the "ReAct agent" tutorial. It's the same pattern n8n uses, but in code.

3. **pgvector on Supabase** — zero new infrastructure RAG:
   https://supabase.com/docs/guides/ai/vector-columns
   One extension, one new column type, unlocks semantic search on your existing data.

4. **Langfuse** — observability when you need it:
   https://langfuse.com/
   Free cloud tier. Add when your first AI feature goes live on the store.

---

## What NOT to build yet

- **CrewAI / AutoGen multi-agent systems** — premature. You don't have enough
  concurrent work to justify coordinating specialist agents. One good agent is enough.
- **Custom embeddings model** — use OpenAI text-embedding-3-small or Supabase's
  built-in embedding via the AI extension. Don't host your own.
- **Kubernetes / async queue deployment** — Cloudflare Workers handles everything
  at your current scale. The article's enterprise tier is not your tier.
- **Full LangSmith / Arize observability** — Langfuse free tier is enough.
  Add it when you have AI features to observe, not before.

---

## The one-line summary

You already have Layers 1, 3 (partial), 5, and 7.
Add Layer 2 (n8n now, LangGraph later) and Layer 4 (pgvector, one click).
Layer 6 comes last, when there's something to observe.
The business hub is not a new project — it's the same stack with more tools registered.

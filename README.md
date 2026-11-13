
<div align="center">



# 🪔 Karigari

### Your Artisan Marketplace — Preserving Tradition, Empowering Artisans

A multilingual, voice-friendly marketplace where Indian artisans sell handmade crafts, run live auctions,
share reels, collaborate with each other and get help from AI agents.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-AI-8E75B2?logo=googlegemini&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-3D-000000?logo=threedotjs&logoColor=white)
![Languages](https://img.shields.io/badge/Languages-22_Indian_+_English-orange)

[✨ Features](#-features) •
[🧭 How it works](#-how-it-works) •
[🛠️ Tech stack](#️-tech-stack) •
[🚀 Getting started](#-getting-started) •
[🗄️ Database](#️-database) •
[☁️ Deployment](#️-deployment) •
[📄 Credits & licence](#-credits--licence)

</div>

---

## 🌟 Overview

Karigari connects **artisans** (sellers) with **buyers**. Sellers get a personal stall, AI help for listings and
stories, auctions, reels and collaboration tools. Buyers get search, recommendations, gifting, chat, AR previews and
an AI shopping assistant, in their own language and, where the browser supports it, by voice.

| 🧑‍🎨 For artisans | 🛍️ For buyers | 🤖 Powered by AI |
|---|---|---|
| Your own stall page and 3D stall | Semantic search and recommendations | Five tool-using AI agents |
| AI product stories, ads and tutorials | Voice input and an AI shopping assistant | Image moderation and embeddings |
| Auctions, reels, collaborations | Gifts, group gifts, custom craft requests | Translation into 22 Indian languages |

---

## ✨ Features

### 🛍️ Buyers
- 🔎 **Marketplace and search**: browse by category, plus **semantic search** that understands meaning, not only keywords
- 🎙️ **Voice input** in the AI chat, direct messages and the 3D navigator (browser speech recognition)
- 🤖 **AI shopping assistant** and a **recommendations** page driven by your activity
- 🛒 **Cart** that works before you sign in and merges into your account afterwards, plus a **wishlist**
- 📖 **Product pages** with the artisan's story and **AR preview** (WebXR, on supported devices)
- 🎁 **Gifting**: send a gift, or start a **group gift** where friends chip in
- 🧵 **Custom craft requests** sent straight to a seller
- 💬 **Direct and group chat**, **follow** your favourite artisans
- 🔨 **Live auctions** with bidding and **MitraPoints** on the 🏆 leaderboard (10 points per auction won)
- 🎬 **Reels** with likes and comments, and public **stall pages**
- 🧭 **3D bazaar** you can walk around (three.js)

### 🧑‍🎨 Artisans (sellers)
- 🏪 **Seller dashboard** with product management and **analytics** (stall views and activity)
- ✍️ **AI product form**: story generation, background removal and **image moderation** (Gemini Vision) before a product goes live
- 🎞️ **AI ad videos** (Creatomate) and 📄 **PDF tutorials** for **virtual products** such as kolam designs
- 🔨 Create and end **auctions**, upload **reels**
- 🤝 **Collaborations**: partner with another seller, add shared products and agree a **revenue split** through proposals
- 🎨 **Stall customization**: themes, welcome message, featured products
- 🏛️ **Scheme Connect**: a list of government and private schemes for vendors
- 💳 **UPI ID** saved on the profile (sellers are prompted for it)

### 🌐 Platform
- 🗣️ **22 Indian languages + English**: Hindi, Assamese, Bengali, Bodo, Dogri, Gujarati, Kannada, Kashmiri, Konkani,
  Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia, Punjabi, Sanskrit, Santhali, Sindhi, Tamil, Telugu, Urdu
- 🌗 **Light and dark theme**
- 🧑‍🏫 **Guided tours** (Intro.js)
- 🔔 **Notifications** for bids, sales and activity
- 🛡️ Optional **rate limiting** (Upstash) and scheduled **cron jobs** for auctions, product checks and clean-up
- 🔐 **Built-in email and password login** (no email confirmation, no third-party auth service)

### 🧠 AI agents (`/agents`)

| Agent | What it helps with |
|---|---|
| 🛍️ **Buyer** | Finding and comparing products |
| 🧑‍🎨 **Artisan** | Listings, pricing guidance, product images |
| 🧭 **Discovery** | Exploring stalls and categories |
| 🤝 **Negotiation** | Analysing offers and drafting replies |
| 📊 **Business Intelligence** | Insights on a seller's performance |

Agents run on Google Gemini, can call **11 tools** over **up to 6 reasoning steps** per request, and keep
**conversation history** per user and session. Their tools mostly **read and draft**; they do not yet act for the user.

---

## 🧭 How it works

### 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Browser["🖥️ Browser"]
        UI["Next.js App Router<br/>React + Tailwind + three.js"]
        I18N["i18next<br/>22 Indian languages + English"]
        VOICE["Web Speech API<br/>voice input"]
    end

    subgraph Server["⚙️ Next.js API routes"]
        AUTH["/api/auth<br/>register + login"]
        MARKET["/api/marketplace<br/>products, search, bazaar"]
        AGENTS["/api/agents/run<br/>tool-calling loop"]
        AUCTION["/api/auction<br/>bids + cron end"]
        SOCIAL["/api/chat, /api/gift<br/>/api/collaboration"]
        AIAPI["/api/generate-*<br/>/api/moderate-product-image<br/>/api/translate, /api/removebg"]
    end

    subgraph Supabase["🗄️ Supabase"]
        PG[("PostgreSQL<br/>+ pgvector")]
        STORE[("Storage<br/>images + videos")]
    end

    subgraph External["🌍 External services"]
        GEM["Google Gemini"]
        CREA["Creatomate<br/>ad videos"]
        TR["Google Translate"]
        RBG["Background removal"]
    end

    UI --> AUTH & MARKET & AGENTS & AUCTION & SOCIAL & AIAPI
    UI --> I18N
    UI --> VOICE
    UI -- "uploads" --> STORE
    AUTH & MARKET & AUCTION & SOCIAL --> PG
    AGENTS --> PG
    AGENTS --> GEM
    AIAPI --> GEM & CREA & TR & RBG
```

### 🔐 Sign-up and sign-in

```mermaid
sequenceDiagram
    actor U as 👤 User
    participant B as 🖥️ Browser
    participant A as ⚙️ /api/auth
    participant D as 🗄️ Supabase (server key)

    U->>B: Enter name, email, password, role
    B->>A: POST /register
    A->>A: Validate input, hash password (scrypt)
    A->>D: Insert into app_users + profiles
    D-->>A: Profile row
    A-->>B: user + profile
    B->>B: Save login in localStorage, merge anonymous cart
    Note over U,D: Later visits
    U->>B: Enter email and password
    B->>A: POST /login
    A->>D: Look up app_users by email
    A->>A: Verify password hash
    A-->>B: user + profile
```

### 🤖 AI agent loop

```mermaid
flowchart TD
    Q["💬 User message"] --> H["📚 Load conversation history"]
    H --> M["🧠 Gemini thinks<br/>(agent prompt + tool list)"]
    M --> D{"Needs a tool?"}
    D -- "Yes" --> T["🔧 Run tool<br/>search_products, get_price_benchmark,<br/>analyze_product_image, analyze_offer ..."]
    T --> R["📥 Tool result"]
    R --> C{"Step limit (6) reached?"}
    C -- "No" --> M
    C -- "Yes" --> F
    D -- "No" --> F["✅ Final answer"]
    F --> S["💾 Save history + tool trace"]
    S --> O["🖥️ Show reply and the tools used"]
```

### 🖼️ From upload to listing

```mermaid
flowchart LR
    A["🧑‍🎨 Seller adds product<br/>photo + details"] --> B["✂️ Optional background removal"]
    B --> C["🛡️ Image moderation<br/>(Gemini Vision)"]
    C --> D{"Approved?"}
    D -- "No" --> E["❌ Rejected with reason"]
    D -- "Yes" --> F["💾 Saved to products"]
    F --> G["🧮 Embedding + image hash"]
    G --> H["🔎 Searchable by meaning<br/>and by look"]
    H --> I["🛍️ Shown in marketplace,<br/>recommendations and stall page"]
```

### 🔨 Auction lifecycle

```mermaid
stateDiagram-v2
    [*] --> scheduled: Seller creates auction
    scheduled --> running: Start time reached
    running --> running: Buyers place higher bids
    running --> completed: Cron ends auction at end time
    running --> cancelled: Seller cancels
    completed --> [*]: Winner set, +10 MitraPoints
    cancelled --> [*]
```

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| 🖥️ Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, Framer Motion, Swiper, Lucide icons |
| 🧊 3D and AR | three.js, WebXR |
| 🌐 i18n | i18next, react-i18next, browser language detection |
| ⚙️ Backend | Next.js API routes (Node runtime) |
| 🗄️ Database | Supabase PostgreSQL with **pgvector**, Supabase Storage |
| 🔐 Auth | Built-in email and password (scrypt hashes in `app_users`) |
| 🤖 AI | Google Gemini (`@google/genai`, `@google/generative-ai`), Transformers.js embeddings (`all-MiniLM-L6-v2`, 384 dimensions) |
| 🎞️ Media | Creatomate (ad videos), PDFKit and pdf-lib (tutorial PDFs), background removal API |
| 🛡️ Ops | Upstash Redis rate limiting (optional), Vercel cron |
| 🔍 Search helpers | Fuse.js, pgvector cosine similarity |

---

## 🚀 Getting started

### ✅ Prerequisites
- Node.js 20 or newer and npm
- A free [Supabase](https://supabase.com) project
- A free [Google AI Studio](https://aistudio.google.com) key for the AI features

### 1️⃣ Install
```bash
git clone https://github.com/kavya19official/Karigari.git
cd Karigari
npm install
```

### 2️⃣ Create the database
In Supabase open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click
**Run**. It is safe to run again. It creates the tables, the database functions, the `images` and `videos` storage
buckets and the login table.

### 3️⃣ Add your keys
```bash
cp .env.example .env.local
```
Fill in `.env.local` (see the table below), then start the app:

```bash
npm run dev
```
Open **http://localhost:3000**.

### 4️⃣ Try it
1. Sign up as a **seller** with any email and a password of 6+ characters.
2. Sign out and sign in again.
3. Add a product from the seller dashboard, then open `/marketplace`, `/agents` and `/auctions`.

### 🔑 Environment variables

| Variable | Needed | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase public (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only key. Sign-up and sign-in need it. Never expose it |
| `GEMINI_API_KEY` | For AI | Server-only Gemini key |
| `NEXT_PUBLIC_GEMINI_MODEL` | Optional | Override the Gemini model |
| `GOOGLE_TRANSLATE_API_KEY` | Optional | Translation API |
| `CREATOMATE_API_KEY` | Optional | AI ad videos |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional | Rate limiting |
| `CRON_SECRET` | Deployment | Protects the cron endpoints |

> ⚠️ Anything starting with `NEXT_PUBLIC_` is visible in the browser. Keep secret keys out of those names.

### 📜 Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | Lint the code |

---

## 🗄️ Database

[`supabase/schema.sql`](supabase/schema.sql) creates **35 tables** in these groups:

| Group | Tables |
|---|---|
| 👤 Accounts | `app_users`, `profiles`, `addresses`, `followers` |
| 🛍️ Shop | `products`, `cart`, `orders`, `order_items`, `notifications` |
| 🔨 Auctions | `auctions`, `bids` |
| 🤝 Collaboration | `collaborations`, `collaboration_revenue_split`, `collaborative_products`, `collaboration_invitations`, `collaboration_activity`, `revenue_split_proposals` |
| 🎬 Social | `reel`, `reel_comment`, `reel_likes`, `chat_threads`, `chat_participants`, `chat_messages`, `chat_message_status` |
| 🎁 Gifting and giving | `gifts`, `group_gifts`, `group_gift_contributions`, `donations`, `custom_requests` |
| 🤖 AI and analytics | `conversation_history`, `user_preferences`, `user_activity` |
| 🏪 Seller tools | `stall_customizations`, `schemes`, `removebg_keys` |

It also defines four functions the app calls: `match_products` (semantic search), `increment_reel_likes`,
`decrement_reel_likes` and `maintain_user_activity` (clean-up).

---

## 🗂️ Project structure

```text
Karigari/
├── public/                  # logos, images, PDF worker
├── supabase/
│   └── schema.sql           # the only SQL file you need
├── src/
│   ├── app/                 # pages (App Router)
│   │   ├── marketplace/  auctions/  reels/  agents/  dm/  gifts/
│   │   ├── dashboard/seller/  stall/[id]/  product/[id]/  profile/
│   │   ├── auth/signin  auth/signup
│   │   └── api/             # backend routes
│   │       ├── auth/ (register, login)
│   │       ├── agents/run   marketplace/   auction/   chat/
│   │       ├── collaboration/   gift/   cron/
│   │       └── generate-*  moderate-product-image  translate  removebg
│   ├── components/          # UI: Navbar, ProductCard, ARViewer, 3D stalls, chat, agents ...
│   ├── contexts/            # AuthContext, theme
│   ├── lib/                 # supabase, agents (runner, tools), i18n, embeddings, moderation
│   └── utils/               # cart helpers and more
├── .env.example
└── vercel.json
```

---

## ☁️ Deployment

1. Push the project to GitHub and import it in **Vercel**.
2. Add the variables from the table above under *Project → Settings → Environment Variables*, plus a long random
   `CRON_SECRET`.
3. Run `npm run build` locally first to catch errors.
4. Open the live site and test sign-up, sign-in, adding a product and one AI agent.

> ℹ️ `NEXT_PUBLIC_*` variables are fixed at build time. Redeploy after changing one.
> The embedding and ML libraries are large, so test search and story generation on the live site.

---

## 🚧 Current status and limitations

- 🛒 **Checkout is a placeholder.** The cart works, but there is no payment gateway yet.
- 🤖 **Agents advise and draft.** They do not yet publish listings or send offers, and have no approval step.
- 🔓 **Row Level Security is off** on most tables, because the API routes use the public key. Move the routes to the
  server key and enable RLS before real users.
- 🔑 **The login is for demos.** Nothing verifies that an email belongs to the person, and the session is kept in the
  browser. Add email verification and server-side sessions before launch.
- 🧪 `supabase/schema.sql` was reconstructed from how the code uses the tables, so check each feature once.

---


**Preserving Tradition, Empowering Artisans ✨**

</div>

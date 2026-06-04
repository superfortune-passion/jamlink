# JamLink Deployment Guide

Deploy **backend → Render** and **frontend → Vercel**, with **freeTURN** for audio relay.

---

## Overview

| Part | Host | URL example |
|------|------|-------------|
| Backend (signaling) | Render | `https://jamlink-api.onrender.com` |
| Frontend (UI) | Vercel | `https://jamlink.vercel.app` |
| TURN (audio relay) | freeTURN | configured via backend env vars |

---

## Step 1 — Push code to GitHub

1. Create a new repo at https://github.com/new (name it e.g. `jamlink`)
2. In PowerShell:

```powershell
cd C:\RePro
git add .
git commit -m "Initial JamLink release with TURN support"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/jamlink.git
git push -u origin main
```

Replace `YOUR_USERNAME/jamlink` with your repo.

---

## Step 2 — Deploy backend on Render

1. Go to https://render.com and sign up / log in
2. **New +** → **Web Service**
3. Connect your GitHub repo
4. Settings:

| Field | Value |
|-------|-------|
| **Name** | `jamlink-api` |
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

5. **Environment Variables** — add these:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://YOUR-APP.vercel.app` *(update after Step 3)* |
| `STUN_SERVERS` | `stun:stun.l.google.com:19302,stun:freeturn.net:3478` |
| `TURN_URL` | `turn:freeturn.net:3478` |
| `TURN_USERNAME` | `free` |
| `TURN_CREDENTIAL` | `free` |

6. Click **Create Web Service** and wait for deploy (~3–5 min)

7. **Test backend:** open `https://jamlink-api.onrender.com/health`  
   You should see `"status":"ok"`

8. **Test TURN config:** open `https://jamlink-api.onrender.com/api/ice-servers`  
   You should see STUN + TURN entries with username `free`

**Copy your backend URL** — e.g. `https://jamlink-api.onrender.com`

---

## Step 3 — Deploy frontend on Vercel

1. Go to https://vercel.com and sign up / log in
2. **Add New → Project**
3. Import your GitHub repo
4. Settings:

| Field | Value |
|-------|-------|
| **Root Directory** | `frontend` (click Edit) |
| **Framework** | Next.js |

5. **Environment Variables:**

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SIGNALING_URL` | `https://jamlink-api.onrender.com` *(your Render URL, no trailing slash)* |

6. Click **Deploy** (~2 min)

7. **Copy your frontend URL** — e.g. `https://jamlink-abc123.vercel.app`

---

## Step 4 — Connect frontend ↔ backend (CORS)

1. Go back to **Render** → your `jamlink-api` service → **Environment**
2. Set `CORS_ORIGIN` to your exact Vercel URL:

```
https://jamlink-abc123.vercel.app
```

3. **Save Changes** — Render will redeploy automatically

---

## Step 5 — Test production

1. Open your **Vercel URL** in Chrome (HTTPS required for mic)
2. Allow microphone
3. Open a **second device** (phone on cellular) or incognito window
4. Both click **Quick Match**
5. Confirm:
   - Status shows **Connected**
   - You hear each other
   - `/api/ice-servers` includes TURN (check if audio fails on mobile)

---

## TURN details (already configured)

freeTURN credentials (testing, ~10 users):

```
TURN_URL=turn:freeturn.net:3478
TURN_USERNAME=free
TURN_CREDENTIAL=free
```

No signup required. JamLink sends these to browsers automatically.

**Upgrade later:** [Metered Open Relay](https://www.metered.ca/tools/openrelay/) (20 GB/mo free) — replace the three TURN env vars with Metered credentials.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Stuck on "Connecting to server..." | Check `NEXT_PUBLIC_SIGNALING_URL` matches Render URL |
| CORS error in browser console | `CORS_ORIGIN` must exactly match Vercel URL (https, no `/` at end) |
| Matched but no audio | TURN env vars missing on Render — redeploy backend |
| Slow first load | Render free tier sleeps after 15 min idle — wait ~30s or upgrade |
| Mic blocked | Must use HTTPS (Vercel provides this) |

---

## Optional — CLI deploy

```powershell
# Vercel (from frontend folder)
cd C:\RePro\frontend
npx vercel
npx vercel --prod
```

Set `NEXT_PUBLIC_SIGNALING_URL` in the Vercel dashboard under Project → Settings → Environment Variables.

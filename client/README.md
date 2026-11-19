This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Hosting: two required headers
Speech recognition runs multi-threaded only when the page is *cross-origin isolated*. Serve every
file with:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```
`npm run dev` and `npm start` (scripts/serve.mjs) already send them. Without them the app still
works, but each voice command takes about twice as long.

## Voice: hands-free and automatic language
- The microphone stays on while the app is visible and wakes up when someone speaks
  (`lib/nano/asr/handsfree.js`). It turns on after one tap, the first time; it pauses while the
  app is hidden or talking; and audio never leaves the phone.
- Each phrase goes through `lib/nano/lid.js`, which detects English/Pidgin, Yoruba, Hausa or Igbo
  (see `ai/language_id/`). The matching N-ATLaS model transcribes it in a Web Worker
  (`lib/nano/asr/worker.js`), and the app switches its language to follow the speaker.
- Hands-free mode only acts on clear commands. Background talk is ignored.

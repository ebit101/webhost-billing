# নিরাপদ মূল্যায়ন ডেমো — বাংলা দ্রুত শুরু

এটি [`SAFE_EVALUATION_DEMO.md`](SAFE_EVALUATION_DEMO.md)-এর সংক্ষিপ্ত বাংলা
সহায়িকা। কোনো অর্থের পার্থক্য হলে ইংরেজি নথিটিই চূড়ান্ত ও প্রামাণ্য।

> [!WARNING]
> এটি একটি আলফা কারিগরি প্রিভিউ (technical preview); লাইভ ব্যবহারের উপযুক্ত নয়
> (not fit for live use)। এখানে শুধু কাল্পনিক ডেটা ব্যবহার করুন
> (fictional-data-only)। বাস্তব গ্রাহকের তথ্য, পরিচয়, ইমেইল ঠিকানা, ডোমেইন,
> পেমেন্ট প্রমাণ, পাসওয়ার্ড, টোকেন বা provider secret দেবেন না। এটি staging বা
> production deployment নয়; production এখনও `NO-GO`।

## যা লাগবে

- Corepack-সহ Node.js 24
- Docker Engine অথবা Docker Desktop
- Docker Compose v2
- loopback-এ খালি port `3100`

প্রথমে শুধু prerequisite পরীক্ষা করুন:

```bash
corepack pnpm demo:doctor
```

`demo:doctor` read-only। এটি sanitized Docker/Compose version, Docker Engine-এর
প্রাপ্যতা, `127.0.0.1:3100` ব্যবহারযোগ্য কি না এবং local runtime file আছে কি না
জানায়। এটি `.demo-runtime/demo.env`-এর ভেতরের মান পড়ে বা দেখায় না এবং কিছু
start, stop, rebuild বা remove করে না। প্রথমবার runtime file না থাকা স্বাভাবিক;
`demo:up` সেটি তৈরি করে।

সব prerequisite pass করলে ডেমো চালু করুন:

```bash
corepack pnpm demo:up
```

প্রথমবার application image build হতে কয়েক মিনিট লাগতে পারে। health check pass
করলে commandটি দেখাবে:

- `http://localhost:3100`;
- `admin@example.test`-এর জন্য তৈরি করা password; এবং
- `customer@example.test`-এর জন্য আলাদা তৈরি করা password।

কোনো password value এই নথিতে নেই। একই fictional login আবার দেখতে ব্যবহার করুন:

```bash
corepack pnpm demo:credentials
```

তৈরি করা password ও অন্য random secret শুধু Git-ignored
`.demo-runtime/demo.env`-এ থাকে। fileটি প্রকাশ করবেন না, public issue-তে paste
করবেন না এবং password অন্য কোথাও reuse করবেন না।
সাধারণ demo lifecycle-এ শুধু `demo:up` fileটি তৈরি করে। `demo:credentials`,
`demo:status`, `demo:logs` ও `demo:down` চালাতে আগে থেকে থাকা readable regular
file দরকার; file missing বা unsafe হলে Docker চালানোর আগেই command refuse করে।

## পাঁচ মিনিটের walkthrough

1. `http://localhost:3100` খুলে local **Why us** ও **Support** section দেখুন, তারপর
   **Explore hosting plans** নির্বাচন করুন। public catalogue প্রথম render-এই উপলভ্য
   **Monthly** price ও কাল্পনিক Starter Hosting checkout action দেখাবে; period খুঁজে
   click করতে হবে না।
2. `customer@example.test` দিয়ে sign in করুন। **Services**, **Invoices**,
   **Orders** এবং **Support** খুলে ownership-bound customer workflow ও seeded
   record দেখুন।
3. sign out করে `admin@example.test` দিয়ে sign in করুন। dashboard এবং
   **Customers**, **Orders**, **Invoices**, **Payments**, **Services** ও **Support**
   দেখুন।
4. সব action-কে disposable evaluation হিসেবে ধরুন। এই stack-এ external email,
   payment বা hosting provider চলে না।
5. কাজ শেষ হলে ডেমো থামান:

   ```bash
   corepack pnpm demo:down
   ```

`demo:down` container থামায়, কিন্তু isolated fictional volume ও তৈরি করা
credential রেখে দেয়। পরের `demo:up` একই local demo আবার চালাতে পারে। এটি
repository-এর সাধারণ development বা production Compose project target করে না।

শুধু ডেমোর কাল্পনিক data, dedicated container/network/volume এবং generated
credential স্থায়ীভাবে মুছতে exact confirmation-সহ ব্যবহার করুন:

```bash
corepack pnpm demo:reset -- --confirm-reset-demo
```

এটি destructive; সাধারণ stop-এর জন্য `demo:down` ব্যবহার করুন। exact flag ছাড়া
reset refuse করে এবং কিছু পরিবর্তন করে না। Docker cleanup সম্পূর্ণ ও যাচাই না হলে
`.demo-runtime/demo.env` রাখা হয়। reset-এর পরে নতুন fictional data ও credential
তৈরি করতে `corepack pnpm demo:up` চালান। এটি development, staging, production,
provider বা unrelated Docker resource target করে না।

## নিরাপত্তা সীমা

- gateway শুধু `127.0.0.1:3100`-এ প্রকাশিত হয়;
- PostgreSQL ও Redis-এর কোনো host-published port নেই;
- bKash, SSLCOMMERZ, cPanel এবং SMTP disabled থাকে;
- worker ও scheduler চলে না;
- database bootstrap শুধু `DEMO_MODE=fictional-only` এবং নির্দিষ্ট demo database
  identity গ্রহণ করে;
- password ও service secret Git-এর বাইরে থাকে এবং image-এ bake করা হয় না; এবং
- local HTTP শুধু এই loopback-only evaluation-এর জন্য। production-এর HTTPS,
  protected secret, backup, monitoring, provider acceptance ও অন্য gate অপরিবর্তিত।

## নিরাপদ troubleshooting ও report

- অবস্থা দেখতে `corepack pnpm demo:status` ব্যবহার করুন।
- সর্বশেষ ১০০টি no-color local log line-এর finite snapshot দেখতে
  `corepack pnpm demo:logs` ব্যবহার করুন। commandটি follow করে না এবং generated
  secret value ও common authentication header redact করে; share করার আগে excerpt
  নিজে review করুন।
- credentials, status, logs বা down যদি missing/unsafe runtime জানায়, তাহলে
  `.demo-runtime/demo.env`-কে readable regular file হিসেবে restore করুন অথবা unsafe
  path সরিয়ে `corepack pnpm demo:up` চালান। এই চার command নিজেরা file তৈরি করে না
  এবং refusal-এর পরে Docker চালায় না।
- `.demo-runtime/demo.env`, password, cookie, token, private host detail বা real
  customer data কখনো issue, chat, screenshot বা log excerpt-এ প্রকাশ করবেন না।
- secret ভুল করে প্রকাশ হলে সেটি public issue-তে আলোচনা না করে
  [`SECURITY.md`](../SECURITY.md)-এর private reporting process অনুসরণ করুন।
- failed health check bypass করবেন না এবং UI ready দেখাতে database-এ সরাসরি
  পরিবর্তন করবেন না।

সম্পূর্ণ command তালিকা, screenshot, troubleshooting এবং নিরাপত্তা ব্যাখ্যার জন্য
প্রামাণ্য ইংরেজি guide [`SAFE_EVALUATION_DEMO.md`](SAFE_EVALUATION_DEMO.md) দেখুন।

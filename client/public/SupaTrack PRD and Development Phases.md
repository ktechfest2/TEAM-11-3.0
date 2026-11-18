# SupaTrack PRD and Development Phases

Nov 17, 2026 · @Obed Meshach

SupaTrack V1 ships a back pod, a chest heart-rate unit, a pitchside base station, one mobile app (coach, player, consumer) and a monolith backend on a local SQLite database, built in nine phases. Each phase ends with something that runs on real data, and Phase 1 starts now on dev kits before Board A prototypes arrive. Firmware is written in C on ESP-IDF.

## 1. Product overview

Grassroots academies cannot afford elite GPS vests, so their coaches judge workload and fatigue by eye; SupaTrack gives them squad tracking at grassroots cost and sells the same pod to individual athletes.

**Goals for V1**

1. Track every player's distance, speed, sprints and heart rate in training and matches, logged on the pod.
2. Show the coach a live pitch view and heart-rate alerts for a squad of up to 25, with no internet at the ground.
3. Give each player a post-session report, squad rankings and coach feedback on their phone.
4. Let an individual runner, cyclist or hiker use one pod with the phone app alone.
5. Explain sessions in plain language with Naz, grounded in the measured data.

**Non-goals for V1**

- Medical diagnosis, SpO2 or clinical ECG claims.
- Video analysis or automatic event tagging (passes, shots).
- A custom base-station PCB (V1 uses an ESP32-S3 dev board).
- Multi-tenant cloud SaaS at scale; V1 runs one backend instance on local SQLite.

## 2. Users and use cases

Three user types share one app and one pod design; the role chosen at sign-up decides which screens they see.

| User | Typical day | Must be able to |
| --- | --- | --- |
| Coach / sports scientist | Runs a 90-minute session for 20–25 players at a ground with no internet | Hand out pods, calibrate the pitch, watch live positions and HR alerts, end the session, sync all pods, review and send feedback |
| Player | Trains 3–5 times a week; may share or not own a phone | Pair a pod and chest unit, see their report and rankings, log readiness, read coach notes, ask Naz |
| Consumer | Runs, cycles or hikes alone | Pair a pod (and optional strap), pick an activity, set goals, get safety alerts, see route maps, ask Naz |
| Admin (academy) | Sets up teams and devices | Create teams, invite coaches and players, assign pods, update firmware |

## 3. Functional requirements

P0 items are needed for the academy pilot, P1 for public launch, P2 can follow later; the phase column says when each is built.

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| **Pod firmware** |  |  |  |
| FW-01 | Power on with the button, hold power in firmware, long press to switch off | P0 | 2 |
| FW-02 | GNSS position and speed at 10 Hz from the MAX-M10S | P0 | 2 |
| FW-03 | IMU steps, cadence, accelerations, impacts from the LSM6DSOX | P0 | 2 |
| FW-04 | Battery percentage from the MAX17048; low-battery shutdown | P0 | 2 |
| FW-05 | Crash-safe session logging to flash at 10 Hz | P0 | 2 |
| FW-06 | BLE service for setup, config, session list and file transfer | P0 | 3 |
| FW-07 | BLE heart-rate client (0x180D) for the chest unit or any strap | P0 | 4 |
| FW-08 | Alerts: per-player HR limit, electrode off, fall, low battery | P0 | 4 |
| FW-09 | ESP-NOW live packets to the base station in time slots | P0 | 6 |
| FW-10 | BLE OTA with rollback | P1 | 9 |
| **Chest unit firmware** |  |  |  |
| CH-01 | ECG sampling, R-peak detection, HR and RR with a quality flag | P0 | 4 |
| CH-02 | Standard Heart Rate Service and Battery Service | P0 | 4 |
| **Base station firmware** |  |  |  |
| BS-01 | Wi-Fi access point and WebSocket bridge for live packets | P0 | 6 |
| BS-02 | Forward coach commands (start, pause, finish) to all pods | P0 | 6 |
| **Backend (monolith)** |  |  |  |
| BE-01 | Accounts, roles (admin, coach, player, consumer), teams, players | P0 | 1 |
| BE-02 | Device registry and pairing (pod + chest unit per player) | P0 | 3 |
| BE-03 | Session upload, parse, metrics and summaries | P0 | 3 |
| BE-04 | Pitch definitions and live recordings | P0 | 6 |
| BE-05 | Leaderboards, readiness, coach directives | P1 | 7 |
| BE-06 | Goals and streaks | P1 | 7 |
| BE-07 | Naz findings, explanations and chat | P1 | 8 |
| BE-08 | Firmware release registry | P1 | 9 |
| BE-09 | CSV export | P1 | 7 |
| **Mobile app** |  |  |  |
| AP-01 | Sign-up, login, role-based navigation | P0 | 1 |
| AP-02 | Pair pod and chest unit; edit player config | P0 | 3 |
| AP-03 | Sync sessions from a pod, offline queue, upload | P0 | 3 |
| AP-04 | Session report: distance, top speed, sprints, HR zones, route | P0 | 3–4 |
| AP-05 | Coach squad sync (sync many pods in sequence) | P0 | 6 |
| AP-06 | Pitch calibration wizard (4 corners) | P0 | 6 |
| AP-07 | Live pitch radar, session timer, HR alert matrix | P0 | 6 |
| AP-08 | Player home, leaderboards, readiness, directives inbox | P1 | 7 |
| AP-09 | Consumer activity modes, goals, progress ring, celebrations | P1 | 7 |
| AP-10 | Naz tab and "Analyze with Naz" | P1 | 8 |
| AP-11 | Firmware update from the app | P1 | 9 |

## 4. Non-functional requirements

The pod must never lose a session and the coach view must work with no internet; everything else is tuned around those two rules.

| Area | Requirement |
| --- | --- |
| Data safety | A power loss or reset loses at most one 4 kB log block; a session is deleted from the pod only after the server confirms it parsed |
| Offline | Pitchside live view, session control and squad sync work with no internet; uploads queue on the phone |
| Battery | Pod lasts at least one 2-hour session with live link and chest unit; target 4 h or more |
| Live latency | Under 1 s from pod to coach screen; under 5% packet loss per pod for 25 pods |
| Accuracy | Distance within 3% of a reference GPS; HR within ±5 BPM of a reference strap for 95% of samples |
| Sync time | One 90-minute session synced over BLE in under 60 s |
| Security | Passwords hashed (argon2); JWT auth; BLE pairing with LE Secure Connections; players see only their own data and squad rankings |
| Privacy | Health-related data (HR) stored only for the account and its team; a user can export and delete their data |
| Phones | Works on budget Android phones (Android 9+) and iOS 16+ |
| Maintainability | One protocol definition generates the C header and TypeScript decoders; CI builds firmware and apps on every pull request |

## 5. Technical baseline

Firmware is C on ESP-IDF; the backend is one NestJS monolith on a local SQLite file, with no separate database, queue or object-storage server. This replaces PostgreSQL, Redis and S3 in the SupaTrack Development Guide.

| Layer | Choice |
| --- | --- |
| Pod, chest unit and base station firmware | C (C11) on ESP-IDF v5.x, FreeRTOS, NimBLE, ESP-NOW; CMake components; Unity tests |
| Backend | NestJS in monorepo mode: one app (apps/backend) plus libraries (db, protocol, metrics), one process |
| Database | SQLite file (`data/supatrack.db`) via better-sqlite3 + Drizzle ORM; WAL mode on |
| Background jobs | A `jobs` table in SQLite, polled by an in-process worker (no Redis) |
| File storage | Local folder `data/files/` for raw session files, clips and firmware images |
| Time series | 10 Hz samples in a `samples` table indexed by (session\_id, t); raw .stk file kept as the source of truth |
| Backups | Litestream streaming the SQLite file to a cloud bucket, or a nightly `sqlite3 .backup` copy |
| Mobile app | Expo (React Native) with react-native-ble-plx; expo-sqlite for the offline queue and cached sessions |
| Web dashboard | React + Vite, served by the monolith |
| Shared code | `backend/libs/protocol` (codegen to C header + TS), `backend/libs/metrics` (TS) |

**SQLite rules**

- Turn on `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON` and a `busy_timeout` of 5000 ms at start-up.
- Only the monolith process opens the database file; never share it over a network drive.
- Insert samples in one transaction per session (about 54,000 rows for 90 minutes), never row by row.
- One SQLite file comfortably holds a few academies; if V2 needs many, switch Drizzle to PostgreSQL (same schema) at that point.

## 6. Success metrics

The academy pilot (Phase 9) succeeds when one squad uses SupaTrack for four weeks without falling back to paper.

| Metric | Target |
| --- | --- |
| Sessions recorded without data loss | 98% or more |
| Pods lasting a full session | 100% of pods charged the night before |
| Squad sync after training | Under 15 minutes for 25 pods |
| Coach uses live view | In 80% of training sessions |
| Players opening their report within 24 h | 60% or more of players with phones |
| Distance and HR accuracy | Within the limits in section 4 |
| Bill of materials per player kit (pod + chest unit) | To be set once Board B is quoted |

## 7. Phase roadmap

Nine phases take V1 from an empty repo to an academy pilot in roughly 26 weeks of build time (about 24 if Phase 5 overlaps Phase 4) plus a 4-week pilot (estimates for one full-stack developer who also writes the firmware). Phases 1–4 run on dev kits; Phase 5 starts whenever Board A boards arrive.

&#91;embedded content: SupaTrack V1 development phases · 9 phases\]

Each phase below lists what it delivers (requirement IDs from section 3), what it needs, step-by-step instructions and exit criteria. Do not start a phase until the previous one's exit criteria are ticked.

## Phase 1: Foundation

Phase 1 sets up the repo, the SQLite monolith with accounts, the shared protocol package, the C firmware skeleton on an ESP32-S3 DevKit, the app shell and CI. Nothing talks to sensors yet; everything after builds on this.

**Delivers:** BE-01, AP-01, protocol codegen, firmware skeleton, CI. **Needs:** a laptop, an ESP32-S3-DevKitC-1 (N8R8), an Android phone. **Estimate:** 2 weeks.

### Step 1.1: Install the tools and create the repo

```bash
# Remove any half-downloaded pnpm left by corepack, then install pnpm and the Nest CLI globally
rm -rf ~/.cache/node/corepack
npm install -g pnpm @nestjs/cli
pnpm -v && nest --version

mkdir -p ~/supatrack && cd ~/supatrack && git init
mkdir -p firmware tools data/files
printf "node_modules/\ndist/\nbuild/\ndata/\n.env\n" > .gitignore
```

The repo has four top-level folders:

```
supatrack/
├─ backend/    NestJS monorepo: apps/backend + libs/db, libs/protocol, libs/metrics
├─ mobile/     Expo app
├─ firmware/   ESP-IDF, C
├─ tools/      pod-sim, session-tools
└─ data/       SQLite file and stored files (not in Git)
```

### Step 1.2: NestJS backend in monorepo mode, on SQLite

```bash
cd ~/supatrack
nest new backend --package-manager pnpm --strict --skip-git
cd backend
nest generate library db          # switches to monorepo mode: apps/backend + libs/db
nest generate library protocol    # accept the @app prefix: import from '@app/protocol'
nest generate library metrics
pnpm add drizzle-orm better-sqlite3 @nestjs/config @nestjs/jwt argon2 zod
pnpm add -D drizzle-kit @types/better-sqlite3
pnpm approve-builds               # allow better-sqlite3 and argon2 to compile
```

Set `"esModuleInterop": true` in `backend/tsconfig.json`, then make the database a global Nest provider in `libs/db`:

```ts
// backend/libs/db/src/db.module.ts
import { Global, Module } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export const DB = Symbol('DB');
export type Db = BetterSQLite3Database<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Db => {
        const sqlite = new Database(process.env.DB_PATH ?? '../data/supatrack.db');
        sqlite.pragma('journal_mode = WAL');
        sqlite.pragma('synchronous = NORMAL');
        sqlite.pragma('foreign_keys = ON');
        sqlite.pragma('busy_timeout = 5000');
        return drizzle(sqlite, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
```

First tables in `backend/libs/db/src/schema.ts`:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('auth_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'coach', 'player', 'consumer'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const teams = sqliteTable('org_teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
});

export const players = sqliteTable('org_players', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  teamId: text('team_id').references(() => teams.id),
  displayName: text('display_name').notNull(),
  shirtNo: integer('shirt_no'),
  hrMax: integer('hr_max'),
});
```

```ts
// backend/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './libs/db/src/schema.ts',
  out: './libs/db/migrations',
  dbCredentials: { url: '../data/supatrack.db' },
});
```

Services get the database by injection:

```ts
// backend/apps/backend/src/auth/users.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, Db } from '@app/db';
import { users } from '@app/db/schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findByEmail(email: string) {
    return this.db.select().from(users).where(eq(users.email, email)).get();
  }
}
```

Export `DB`, `Db` and `DbModule` from `libs/db/src/index.ts`, and add a `@app/db/schema` path in `tsconfig.json` next to the ones Nest created. Then:

1. `pnpm drizzle-kit generate` and `pnpm drizzle-kit migrate`.
2. `nest g module auth`, `nest g service auth`, `nest g controller auth`: register, login, refresh; argon2 hashing; 15-minute access token, 30-day refresh token.
3. `nest g resource org` (REST, no CRUD stubs you do not need): teams, players, invites.
4. A `RolesGuard` and `@Roles()` decorator so coach-only routes reject players.
5. `GET /health` returning the app version and database status.
6. `pnpm start:dev` serves the API on port 3000.

Keep `libs/protocol` and `libs/metrics` as plain functions with no Nest decorators or Node-only imports: the Expo app imports them too.

### Step 1.3: Shared protocol package

One YAML file defines each packet; a Node script writes the C header for firmware and the TypeScript decoder for the app and API.

```yaml
# backend/libs/protocol/spec/live_packet.yaml
name: stk_live_packet
version: 1
fields:
  - { name: version_role, type: u8 }
  - { name: player_id,    type: u8 }
  - { name: seq,          type: u16 }
  - { name: t_ms,         type: u32 }
  - { name: lat_e7,       type: i32 }
  - { name: lon_e7,       type: i32 }
  - { name: speed_cms,    type: u16 }
  - { name: heading_cdeg, type: u16 }
  - { name: fix_sats,     type: u8 }
  - { name: hr_bpm,       type: u8 }
  - { name: hr_quality,   type: u8 }
  - { name: dist_cm,      type: u32 }
  - { name: sprints,      type: u8 }
  - { name: hsr_m,        type: u16 }
  - { name: accel_peak_dg, type: u8 }
  - { name: battery_pct,  type: u8 }
  - { name: flags,        type: u8 }
  - { name: crc8,         type: u8 }
```

`pnpm run protocol:gen (in backend/)` writes `firmware/components/protocol/include/stk_protocol.h` (a packed struct plus a `_Static_assert` that its size is 34 bytes) and `backend/libs/protocol/src/generated.ts` (DataView decoder and encoder). Commit three hex test vectors with their expected JSON in `backend/libs/protocol/test-vectors/`.

### Step 1.4: C firmware skeleton

```bash
cd firmware
idf.py create-project supatrack && mv supatrack/* . && rmdir supatrack
idf.py set-target esp32s3
mkdir -p components/board components/power_latch components/protocol
```

Choose the board in `main/Kconfig.projbuild` (choice `STK_BOARD`: `STK_BOARD_DEVKIT_S3`, `STK_BOARD_A_REVA`) and the role (`STK_ROLE_POD`, `STK_ROLE_CHEST`, `STK_ROLE_BASE`). Pins live in one header:

```c
/* components/board/include/board.h */
#pragma once
#include "driver/gpio.h"

#if CONFIG_STK_BOARD_A_REVA
#define PIN_PWR_HOLD   GPIO_NUM_13
#define PIN_BTN_SENSE  GPIO_NUM_14
#define PIN_I2C_SDA    GPIO_NUM_8
#define PIN_I2C_SCL    GPIO_NUM_9
#define PIN_GPS_TX     GPIO_NUM_17
#define PIN_GPS_RX     GPIO_NUM_18
#define PIN_GPS_EN_N   GPIO_NUM_21
#define PIN_LED_RED    GPIO_NUM_4
#define PIN_LED_GREEN  GPIO_NUM_5
#define PIN_BUZZER     GPIO_NUM_6
#define PIN_MOTOR      GPIO_NUM_7
#elif CONFIG_STK_BOARD_DEVKIT_S3
/* Same pins wired to breakout boards on the DevKit */
#define PIN_PWR_HOLD   GPIO_NUM_13
#define PIN_BTN_SENSE  GPIO_NUM_14
#define PIN_I2C_SDA    GPIO_NUM_8
#define PIN_I2C_SCL    GPIO_NUM_9
#define PIN_GPS_TX     GPIO_NUM_17
#define PIN_GPS_RX     GPIO_NUM_18
#define PIN_GPS_EN_N   GPIO_NUM_21
#define PIN_LED_RED    GPIO_NUM_4
#define PIN_LED_GREEN  GPIO_NUM_5
#define PIN_BUZZER     GPIO_NUM_6
#define PIN_MOTOR      GPIO_NUM_7
#endif
```

The power latch is held first thing in `app_main`, because on Board A the pod switches off the moment IO13 is low:

```c
/* components/power_latch/power_latch.c */
#include "board.h"
#include "power_latch.h"

void power_latch_hold(void)
{
    gpio_reset_pin(PIN_PWR_HOLD);
    gpio_set_direction(PIN_PWR_HOLD, GPIO_MODE_OUTPUT);
    gpio_set_level(PIN_PWR_HOLD, 1);
    gpio_hold_en(PIN_PWR_HOLD);   /* keep HIGH across software resets */
}

void power_latch_release(void)
{
    gpio_hold_dis(PIN_PWR_HOLD);
    gpio_set_level(PIN_PWR_HOLD, 0);   /* battery disconnects here */
}
```

```c
/* main/main.c */
#include "esp_log.h"
#include "board.h"
#include "power_latch.h"
#include "stk_protocol.h"

static const char *TAG = "stk";

void app_main(void)
{
    power_latch_hold();
    ESP_LOGI(TAG, "SupaTrack fw %s, protocol v%d", CONFIG_APP_PROJECT_VER, STK_PROTOCOL_VERSION);
    /* Phase 2 adds: i2c bus, gnss, imu, fuel gauge, logger, button task */
}
```

Build and flash the DevKit: `idf.py build && idf.py -p /dev/ttyACM0 flash monitor`. The boot log must show the firmware and protocol versions.

### Step 1.5: App shell

```bash
cd ~/supatrack
pnpm dlx create-expo-app mobile --template blank-typescript
cd mobile
echo "node-linker=hoisted" > .npmrc      # Metro works best with a flat node_modules
npx expo install expo-dev-client expo-sqlite expo-secure-store
pnpm add react-native-ble-plx @tanstack/react-query zustand
eas build --profile development --platform android
```

Share code with the backend: add `../backend/libs` to `watchFolders` in `metro.config.js`, and map `@supatrack/protocol` and `@supatrack/metrics` to `../backend/libs/protocol/src` and `../backend/libs/metrics/src` in `tsconfig.json` paths and in babel-plugin-module-resolver.

Build the login and sign-up screens, store tokens in expo-secure-store, and route to three empty home stacks by role (coach, player, consumer). Add the `react-native-ble-plx` config plugin to `app.json` now, so Phase 3 needs no rebuild.

### Step 1.6: CI

One GitHub Actions workflow with four jobs on every pull request: backend (`pnpm install`, `pnpm lint`, `pnpm test`, `pnpm build` in `backend/`); mobile (`pnpm tsc --noEmit` in `mobile/`); firmware build in the `espressif/idf:v5.3` container for both boards; and a protocol check that runs `pnpm run protocol:gen` and fails if the generated files differ from those committed.

### Exit criteria

- [ ] `pnpm start:dev` in `backend/` starts the API on a fresh clone and creates `data/supatrack.db`.
- [ ] A user can sign up and log in from the Android dev build; role decides the home screen.
- [ ] DevKit boots, holds IO13 high and logs firmware and protocol versions.
- [ ] The generated C struct is 34 bytes; TS and C both pass the shared test vectors.
- [ ] CI is green on `main`.

## Phase 2: Pod firmware core

Phase 2 turns the DevKit into a working pod that records a real session to flash: GNSS at 10 Hz, IMU features, battery level, button and crash-safe logging, all in C.

**Delivers:** FW-01 to FW-05. **Needs:** Phase 1; breakouts for MAX-M10S (with patch antenna), LSM6DSOX and MAX17048; a LiPo cell. **Estimate:** 3 weeks.

### Step 2.1: Partition table

```
# firmware/partitions.csv  (8 MB flash)
# Name,    Type, SubType, Offset,   Size
nvs,       data, nvs,     0x9000,   0x6000
otadata,   data, ota,     0xf000,   0x2000
phy_init,  data, phy,     0x11000,  0x1000
ota_0,     app,  ota_0,   0x20000,  0x200000
ota_1,     app,  ota_1,   0x220000, 0x200000
stklog,    data, 0x40,    0x420000, 0x3E0000
```

Set `CONFIG_PARTITION_TABLE_CUSTOM=y` in `sdkconfig.defaults`. The `stklog` partition (about 3.9 MB) holds two 90-minute sessions.

### Step 2.2: Drivers (one ESP-IDF component each)

| Component | Bus | First thing to check | Key settings |
| --- | --- | --- | --- |
| `i2c_bus` | I2C master on IO8/IO9, 400 kHz | Scan finds 0x36 and 0x6A | New `i2c_master` driver (ESP-IDF 5.x) |
| `lsm6dsox` | I2C 0x6A | WHO\_AM\_I (reg 0x0F) reads 0x6C | Accel ±16 g at 104 Hz, gyro 2000 dps, FIFO on, INT1 on FIFO threshold |
| `max17048` | I2C 0x36 | VERSION (reg 0x08) reads back | Read VCELL (0x02) and SOC (0x04) every 10 s; alert threshold 15% |
| `gnss_m10` | UART1, IO17/IO18 | NMEA text at 9600 baud after power-on | UBX-CFG-VALSET: UART1 baud 115200, NAV-PVT output on UART1, NMEA off, measurement rate 100 ms (10 Hz) |
| `alerts` | GPIO and LEDC PWM | LEDs, 4 kHz buzzer, motor | Pattern player: single, double, continuous |
| `button` | IO14 input | Press is read LOW | Long press 2 s = power off |

GNSS configuration keys for the MAX-M10S (send in RAM layer, then switch the ESP32 UART to 115200):

| Key | ID | Value |
| --- | --- | --- |
| CFG-UART1-BAUDRATE | 0x40520001 | 115200 |
| CFG-UART1OUTPROT-NMEA | 0x10740002 | 0 |
| CFG-MSGOUT-UBX\_NAV\_PVT\_UART1 | 0x20910007 | 1 |
| CFG-RATE-MEAS | 0x30210001 | 100 (ms) |

Power the GNSS on with `gpio_set_level(PIN_GPS_EN_N, 0)`; before powering it off, set the UART TX pin to input so the module is not back-powered.

### Step 2.3: Tasks

| Task | Priority | Period | Does |
| --- | --- | --- | --- |
| `gnss_task` | 6 | UART event | Parses UBX-NAV-PVT, checks UBX checksum, pushes a fix to the fusion queue |
| `imu_task` | 6 | FIFO interrupt | Reads the FIFO, detects steps and impacts, outputs features every 100 ms |
| `fusion_task` | 5 | 100 ms | Builds the 10 Hz record: position, speed, distance, cadence, accel peak, flags |
| `log_task` | 4 | Queue | Fills a 4 kB RAM block, writes it with CRC-32 when full |
| `power_task` | 3 | 1 s | Button, fuel gauge, low-battery shutdown, LEDs |

### Step 2.4: Session logger

1. Session start writes a 64-byte header (magic `STK1`, protocol version, serial, start time from GNSS, firmware version) into a new block.
2. Records go into a 4 kB RAM buffer; a full buffer is written with `esp_partition_write` after an erase of the next 4 kB sector, followed by its CRC-32.
3. Session stop flushes the partial block and writes the footer (record count, file CRC).
4. On boot, the logger scans blocks, rebuilds the session index from headers, and marks a session with no footer as "recovered".
5. Keep a session index in NVS (ID, first block, length, synced flag) for fast listing in Phase 3.

### Step 2.5: Field test

Record three sessions: a 20-minute walk, a 20-minute jog with sprints, and one where you pull the battery mid-session. Dump them over USB serial with a small `stk_dump` console command and decode with `tools/session-tools`.

### Exit criteria

- [ ] GNSS gives 10 Hz NAV-PVT with a fix within 60 s cold start outdoors.
- [ ] Distance of the walk within 5% of a phone or watch GPS (tightened to 3% in Phase 5).
- [ ] Pulling the battery loses no more than one 4 kB block; the session reappears as recovered.
- [ ] Battery percentage and low-battery shutdown work on a real cell.
- [ ] Unity tests pass for the UBX parser, CRC and record packing.

## Phase 3: BLE and session sync

Phase 3 moves a recorded session from the pod to the phone to the monolith and back as a report: the first end-to-end slice of the product.

**Delivers:** FW-06, BE-02, BE-03, AP-02, AP-03, AP-04 (without HR). **Needs:** Phase 2 sessions on the DevKit. **Estimate:** 3 weeks.

### Step 3.1: Pod GATT service (C, NimBLE)

1. Enable NimBLE in menuconfig (`CONFIG_BT_NIMBLE_ENABLED`) with peripheral and central roles, and LE Secure Connections.
2. Define the service from `backend/libs/protocol/spec/gatt.yaml`: Device info (read), Player config (read/write, stored in NVS), Control (write + notify), Live status (notify 1 Hz), File transfer (write + notify), plus Battery Service 0x180F.
3. Advertise as `STK-A-<last 4 of serial>`; request 2M PHY and MTU 517 after connect.
4. File transfer: the app writes `{session_id, offset}`; the pod notifies chunks of `MTU − 3` bytes with a running offset; the app re-requests from the last good offset after a drop.
5. Control commands: `LIST_SESSIONS`, `START_SESSION`, `STOP_SESSION`, `DELETE_SESSION(id)`, `SET_TIME`, `GNSS_ON/OFF`.

### Step 3.2: Monolith tables and endpoints (SQLite)

| Table | Purpose |
| --- | --- |
| `devices_devices` | id, kind, serial, mac, board, fw\_version, player\_id |
| `sessions_sessions` | id, player\_id, team\_id, kind, started\_at, duration\_s, file\_path, status |
| `metrics_samples` | session\_id, t\_ms, lat\_e7, lon\_e7, speed\_cms, hr, hr\_q, cadence, accel\_peak, flags; index on (session\_id, t\_ms) |
| `metrics_summary` | session\_id, distance\_m, top\_speed, hsr\_m, sprints, accels, decels, zone\_times (JSON) |
| `jobs` | id, type, payload (JSON), status, attempts, run\_after, last\_error |

Endpoints: `POST /devices/pair`, `POST /sessions` (multipart upload of the raw .stk file, saved to `data/files/sessions/<id>.stk`), `GET /sessions/:id`, `GET /sessions/:id/samples?step=10`, `GET /players/:id/sessions`.

The worker is a NestJS provider that polls `jobs` every second, takes one row with `UPDATE … SET status='running' WHERE id = (SELECT id … LIMIT 1) RETURNING *`, and runs `session.parse` then `metrics.compute`. Samples are inserted in a single transaction per session.

### Step 3.3: Metrics package

`backend/libs/metrics` holds pure TypeScript functions with unit tests on recorded sessions: `distance()`, `topSpeed()`, `speedBands()` (HSR above 19.8 km/h, sprint above 25.2 km/h for 1 s, both configurable), `accelEvents()`, `cadence()`. The API worker and the app use the same functions.

### Step 3.4: App sync flow

1. Scan for `STK-` devices, connect, read Device info, pair to the logged-in player (`POST /devices/pair`).
2. Send `LIST_SESSIONS`; for each unsynced session, pull the file, check its CRC, save it with expo-file-system and add a row to the expo-sqlite `upload_queue`.
3. Upload when online; on `status=ready`, send `DELETE_SESSION` to the pod.
4. Session report screen: distance, top speed, sprints, HSR, speed-over-time chart and a route map.

### Exit criteria

- [ ] A 90-minute session syncs in under 60 s on a budget Android phone.
- [ ] A dropped connection resumes from the last offset with no corrupted file.
- [ ] The pod deletes a session only after the server reports it ready.
- [ ] Report numbers match `tools/session-tools` output for the same file.

## Phase 4: Heart rate and chest unit

Phase 4 adds heart rate to every session, first from a commercial strap, then from the SupaTrack chest unit firmware on an ESP32-C3 DevKit.

**Delivers:** FW-07, FW-08, CH-01, CH-02, HR parts of AP-04. **Needs:** Phase 3; a BLE chest strap (for example Polar H10); ESP32-C3 DevKit, AD8232 breakout and gel electrodes. **Estimate:** 3 weeks.

### Step 4.1: Pod HR client (C)

1. Add a NimBLE central role alongside the peripheral: scan for service 0x180D, or for the chest unit MAC stored in Player config.
2. Subscribe to Heart Rate Measurement (0x2A37); parse flags, 8- or 16-bit HR, sensor-contact bits and RR intervals (1/1024 s).
3. Feed HR, RR and a quality value (contact bit plus RR plausibility) into the 10 Hz record.
4. Reconnect automatically within 5 s of a drop; mark samples with no HR as 0.

### Step 4.2: Alerts on the pod

| Alert | Rule | Output |
| --- | --- | --- |
| HR limit | HR above the player's limit (from Player config) for 5 s and quality good | Continuous buzz + vibration |
| Electrode off | Contact lost or chest unit reports lead-off | Double beep |
| Fall | Accel peak above 4.5 g, then stillness for 20 s | Alarm; SOS flag on Live status |
| Low battery | Below 15% | Red LED, one beep |

No HR alert fires while quality is poor.

### Step 4.3: Chest unit firmware (C, `ROLE=chest`, target esp32c3)

1. Sample the AD8232 output with the continuous ADC driver at 250 Hz; read LO+ and LO− on two GPIOs.
2. Filter 5–15 Hz (band-pass), then detect R peaks with a Pan-Tompkins style detector; reject RR outside 300–2000 ms.
3. Publish HR (median of the last 5 beats) and RR through the standard Heart Rate Service once a second; Battery Service from a voltage divider.
4. Measure average current with the PPK2 and record it; this decides ESP32-C3 against nRF52 for Board B.

### Step 4.4: Backend and app

Add `hr_max` per player, compute zones (warm-up, fat burn, cardio, peak; red zone above 85%) in `backend/libs/metrics`, and show the HR chart and zone bar in the report.

### Exit criteria

- [ ] Pod logs HR from the commercial strap with under 1% gaps on a 30-minute run.
- [ ] Chest unit HR within ±5 BPM of the strap for 95% of samples at rest and jogging.
- [ ] HR-limit alert fires on a forced high limit test and stays silent with electrodes off.
- [ ] Chest unit average current measured and the Board B processor decision made.

## Phase 5: Board A bring-up and validation

Phase 5 moves the firmware from the DevKit to real Board A Rev A pods and proves the hardware; it can start as soon as the JLCPCB order arrives, in parallel with Phase 4.

**Delivers:** working Board A pods, measured runtime, GNSS accuracy result, decision on Rev B changes. **Needs:** 5–10 assembled Board A boards, bench supply, multimeter, PPK2, cells with JST pin 1 = +. **Estimate:** 2 weeks after boards arrive.

1. Run the 11-step bring-up checklist from the Board A package on each board; record results per serial number.
2. Build with `STK_BOARD_A_REVA`, close JP1, flash over USB-C, open JP1.
3. Verify the power latch: on with a short press, off with a 2 s press, and still on after a forced `esp_restart()`, a task watchdog reset and a brownout. If any reset switches the pod off, raise it as a Rev B change.
4. Measure with the PPK2: OFF current (target under 60 µA), session current with GNSS 10 Hz and BLE, then with the HR link added.
5. GNSS accuracy: walk a measured 1 km route and a 400 m track with a pod in its enclosure and a reference GPS watch; compare distance and top speed.
6. Body-link test: chest unit (DevKit for now) on the chest, pod on the upper back; log HR gaps during sprints.
7. Write a short bring-up report and list Rev B changes (for example reverse-polarity protection, reset hold).

### Exit criteria

- [ ] All boards pass bring-up; failures traced to a cause.
- [ ] Pod survives every reset type without powering off, or a Rev B fix is agreed.
- [ ] Measured runtime at least 2 h in team mode on 500 mAh.
- [ ] Distance within 3% of the reference on the 1 km route.

## Phase 6: Pitchside live system

Phase 6 gives the coach a live radar for the whole squad with no internet: pods → ESP-NOW → base station → Wi-Fi WebSocket → coach tablet.

**Delivers:** FW-09, BS-01, BS-02, BE-04, AP-05, AP-06, AP-07. **Needs:** Phases 3–5; an ESP32-S3 DevKit as base station; an Android tablet. **Estimate:** 4 weeks.

### Step 6.1: Base station firmware (C, `ROLE=base`)

1. Start a Wi-Fi soft-AP (`SupaTrack-Base-XXXX`, WPA2) on channel 1 and keep ESP-NOW on the same channel.
2. Register an ESP-NOW receive callback; push each 34-byte packet into a queue.
3. Run the ESP-IDF `esp_http_server` with WebSocket support on port 81; send each packet as a binary frame to every connected client.
4. Accept text commands from the app (`START`, `PAUSE`, `FINISH`, `SYNC_TIME`) and broadcast them to pods over ESP-NOW.

### Step 6.2: Pod live sender (C)

1. Store the base station MAC and the player's slot in Player config.
2. Send the live packet every 500 ms at `slot × (500 / 25)` ms after each GNSS-aligned half second.
3. Keep NimBLE (chest unit link) running; tune its connection interval to 30–50 ms and test that both links hold.

### Step 6.3: Coach app features

1. Squad sync: list the team's pods, connect to each in turn, pull new sessions, show progress per player.
2. Pitch calibration: a spare pod in calibration mode; the wizard reads 10–20 s of averaged fixes at each corner, checks the shape and saves the pitch (`POST /pitches`).
3. Live radar: connect to `ws://192.168.4.1:81`, decode frames with `backend/libs/protocol`, convert lat/lon to pitch metres, draw players on a pitch canvas (react-native-skia), with session timer and pause/finish.
4. Alert matrix: one tile per player showing HR, zone colour and alert flags.
5. Record the live stream to expo-sqlite; upload it with the session for the coach's replay.
6. Android: allow cleartext to 192.168.4.1 in the network security config.

### Step 6.4: Test without 25 pods

Run `tools/pod-sim --squad 25 --ws` to feed the radar with synthetic players, then repeat with every real pod you have.

### Exit criteria

- [ ] 25 simulated players render smoothly on a budget tablet.
- [ ] Real pods on a full-size pitch: under 1 s latency and under 5% packet loss per pod.
- [ ] HR from the chest unit keeps flowing while the live link runs.
- [ ] Squad sync of all available pods completes without manual retries.

## Phase 7: Player and consumer features

Phase 7 builds the everyday app value on top of synced sessions: rankings, readiness and coach feedback for players; activity modes and goals for consumers.

**Delivers:** BE-05, BE-06, BE-09, AP-08, AP-09. **Needs:** Phase 3 data (Phase 6 for coach notes on live sessions). **Estimate:** 4 weeks.

**Player**

1. Home: last session card, weekly load, readiness score, next session.
2. Leaderboards: top speed, distance, sprints, work rate per week, from `metrics_summary` (SQL views over SQLite).
3. Readiness check-in: sleep, soreness, stress (1–5); stored in `feedback_readiness`.
4. Directives inbox: coach notes and targets; video clips stored under `data/files/clips/`.
5. Step balance trend from the IMU, shown as a trend only.

**Consumer**

1. Activity modes: Running, Cycling, Hiking, Walking (GNSS modes); each sets speed units, auto-pause and calorie formula.
2. Live view on the phone over the BLE Live status characteristic: pace, HR zone, distance.
3. Goals: per session, weekly, monthly; progress ring; milestone buzz on the pod or phone.
4. Celebrations and streaks on session save.
5. Route map with speed colouring and elevation profile.

**Coach dashboard (web)**

Session list, per-player breakdown, squad comparison, CSV export (`GET /sessions/:id/export.csv`).

### Exit criteria

- [ ] A player sees their report, rank and coach notes within a minute of upload.
- [ ] A consumer completes a run with a goal, sees the progress ring and gets the celebration card.
- [ ] CSV export opens correctly in Excel and Google Sheets.

## Phase 8: Naz AI

Phase 8 adds Naz as an analyst that explains measured findings; code computes the numbers, the LLM only explains them.

**Delivers:** BE-07, AP-10. **Needs:** Phase 4 (HR) and Phase 7; an LLM API key. **Estimate:** 3 weeks.

1. **Findings engine** (`backend/libs/metrics/findings.ts`): second-half distance and speed drop, time above 85% HRmax, cardiac drift (HR rising at steady pace), cadence decay on climbs, acceleration asymmetry. Each finding has a type, the values and a severity.
2. Store findings in `naz_findings` when a session is computed.
3. **Analyze with Naz:** the worker builds a prompt from the player profile, the session summary and the findings (not raw samples), calls the LLM, and stores the answer in `naz_messages`.
4. **Chat:** follow-up questions include the session's findings and the last 10 messages; answers must cite numbers from the findings.
5. **Guardrails:** a fixed system prompt that forbids medical diagnosis and tells users to see a doctor for chest pain, dizziness or fainting; refuse questions with no session data behind them.
6. **Offline:** the app queues Naz requests and shows the deterministic findings even without internet.
7. Log token use per request in SQLite to watch cost.

### Exit criteria

- [ ] Every Naz answer quotes at least one number that matches the session report.
- [ ] Naz declines diagnosis questions in a test set of 20 prompts.
- [ ] Findings appear in the app with no internet.

## Phase 9: OTA, production test and academy pilot

Phase 9 makes the system maintainable in the field and proves it with one real academy squad for four weeks.

**Delivers:** FW-10, BE-08, AP-11, production test, pilot report. **Needs:** Phases 1–8; 25 pods and chest units (Board B prototypes or straps). **Estimate:** 2 weeks build + 4 weeks pilot.

1. **OTA:** OTA characteristic on the pod; app downloads the image from `GET /firmware/latest`, checks sha256, streams it, pod verifies, switches slot and reboots with IO13 held; new firmware calls `esp_ota_mark_app_valid_cancel_rollback()` after a health check. Block OTA below 40% battery.
2. **Firmware registry:** upload signed builds per role and board to `data/files/firmware/`; CI attaches builds on `fw-v*` tags.
3. **Production test:** pogo-pin fixture on the TP grid plus a script that flashes, runs self-tests (I2C scan, IMU self-test, gauge read, GNSS fix on a roof antenna, buzzer, motor) and records serial, MAC and results in SQLite.
4. **Deployment:** the monolith and its SQLite file on one small VPS or a local machine at the academy office; Litestream (or a nightly `.backup`) to a cloud bucket; Caddy for HTTPS.
5. **Pilot:** one squad, four weeks; weekly check-in with the coach; track the success metrics in section 6.
6. Write the pilot report and the V1.1 backlog.

### Exit criteria

- [ ] OTA from the app succeeds on 25 pods with automatic rollback on a bad build.
- [ ] Every pod in the pilot passed production test.
- [ ] Success metrics in section 6 met, or a fix planned for each miss.

## Dependencies and open questions

Three outside dependencies set the pace: the Board A order, the Board B design, and an academy willing to pilot.

| Dependency | Needed by | Owner |
| --- | --- | --- |
| Board A Rev A boards assembled (approve MAX-M10S, 1.0 mm, battery size first) | Phase 5 | Hardware designer + you |
| Board B design and prototypes | Phase 9 (straps cover earlier phases) | Hardware designer |
| Enclosure and vest with electrodes | Phase 5 field tests, Phase 9 pilot | To be assigned |
| Pilot academy agreement | Phase 9 | You |

**Open questions**

- [ ] Where does the monolith run in V1: a VPS, or a machine at the academy? (Both work with SQLite; a VPS lets players sync from home.)
- [ ] Will players have their own phones, or does the coach tablet do all syncing?
- [ ] Consumer kit: pod only, or pod plus chest strap?
- [ ] Board B processor after the Phase 4 current measurement: ESP32-C3 or nRF52 (nRF52 would mean Zephyr, still C).

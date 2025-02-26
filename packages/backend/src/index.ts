import "./instrument"

import Koa from "koa"
import bodyParser from "koa-bodyparser"
import logger from "koa-logger"
import prexit from "prexit"

import v1 from "./api/v1"
import auth from "./api/v1/auth"
import { authMiddleware } from "./api/v1/auth/utils"
import redirections from "./api/v1/redirections"
import webhooks from "./api/webhooks"
import { corsMiddleware } from "./utils/cors"
import { setupCronJobs } from "./utils/cron"
import sql, { checkDbConnection } from "./utils/db"
import { errorMiddleware } from "./utils/errors"
import { setDefaultBody } from "./utils/misc"
import ratelimit from "./utils/ratelimit"
import * as Sentry from "@sentry/node"

import licenseMiddleware from "./utils/license"
import config from "./utils/config"
import { startMaterializedViewRefreshJob } from "./jobs/materializedViews"

checkDbConnection()
setupCronJobs()

if (process.env.NODE_ENV === "production") {
  startMaterializedViewRefreshJob()
}

const app = new Koa()
Sentry.setupKoaErrorHandler(app)
// Forward proxy headers
app.proxy = true

// MiddleWares

app.use(errorMiddleware)
app.use(logger())
app.use(corsMiddleware)
app.use(authMiddleware)

app.use(ratelimit)
app.use(bodyParser({ jsonLimit: "5mb", textLimit: "5mb" }))
app.use(setDefaultBody)

if (config.IS_SELF_HOSTED) {
  app.use(licenseMiddleware)
}

// Routes
app.use(redirections.routes())
app.use(v1.routes())
app.use(auth.routes())
app.use(webhooks.routes())

const PORT = Number(process.env.PORT || 3333)
const server = app.listen(PORT, () =>
  console.log(`✅ Lunary API server listening on port ${PORT}`),
)

prexit(async () => {
  console.log("Shutting down server...")
  await sql.end({ timeout: 5 })
  await new Promise((r) => server.close(r))
  process.exit(1)
})

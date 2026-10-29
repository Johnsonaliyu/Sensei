import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { restoreSavedWhatsappSessions } from "../lib/whatsapp";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  void restoreSavedWhatsappSessions();
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;

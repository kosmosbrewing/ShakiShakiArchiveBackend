// server/routes/address.routes.ts
// 배송지 관련 라우트 (/api/user/addresses/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { insertDeliveryAddressSchema } from "@shared/schema";

const router = Router();

// 배송지 목록 조회
router.get("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const addresses = await storage.getDeliveryAddresses(userId);
  res.json(addresses);
}));

// 배송지 추가
router.post("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const validatedData = insertDeliveryAddressSchema.parse({
    ...req.body,
    userId,
  });
  const address = await storage.createDeliveryAddress(validatedData);
  res.status(201).json(address);
}));

// 배송지 수정 (UUID 기반)
router.patch("/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const addressId = req.params.id; // UUID 문자열

  const updated = await storage.updateDeliveryAddress(
    addressId,
    userId,
    req.body
  );
  if (!updated) {
    return res.status(404).json({ message: "Address not found" });
  }
  res.json(updated);
}));

// 배송지 삭제 (UUID 기반)
router.delete("/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const addressId = req.params.id; // UUID 문자열

  await storage.deleteDeliveryAddress(addressId, userId);
  res.json({ message: "Address deleted" });
}));

export default router;

// server/routes/constants.routes.ts
// 프론트엔드 공용 상수 API (공개 정보만 노출)

import { Router } from "express";
import { cacheStrategies, etagMiddleware } from "../middleware";
import {
  // 배송비 관련
  SHIPPING,
  // 주문 관련
  ORDER_STATUS,
  ORDER_STATUS_ENUM,
  NON_CANCELABLE_STATUSES,
  // 결제 관련
  PAYMENT_PROVIDER,
  // 검증 관련
  QUANTITY,
  PRICE,
  PASSWORD,
  INQUIRY,
  // 메시지 관련
  VALIDATION_MESSAGES,
} from "@shared/constants";

const router = Router();

/**
 * GET /api/constants
 * 프론트엔드 Pinia 스토어용 전체 상수 조회
 */
router.get("/", etagMiddleware(), cacheStrategies.staticData, (_req, res) => {
  res.json({
    shipping: SHIPPING,
    order: {
      status: ORDER_STATUS,
      statusEnum: ORDER_STATUS_ENUM,
      nonCancelableStatuses: NON_CANCELABLE_STATUSES,
    },
    payment: {
      provider: PAYMENT_PROVIDER,
    },
    validation: {
      quantity: QUANTITY,
      price: PRICE,
      password: { minLength: PASSWORD.MIN_LENGTH },
      inquiry: INQUIRY,
    },
    messages: {
      validation: VALIDATION_MESSAGES,
    },
  });
});

/**
 * GET /api/constants/shipping
 * 배송비 설정 조회
 */
router.get("/shipping", etagMiddleware(), cacheStrategies.staticData, (_req, res) => {
  res.json(SHIPPING);
});

/**
 * GET /api/constants/order
 * 주문 상태 상수 조회
 */
router.get("/order", etagMiddleware(), cacheStrategies.staticData, (_req, res) => {
  res.json({
    status: ORDER_STATUS,
    statusEnum: ORDER_STATUS_ENUM,
    nonCancelableStatuses: NON_CANCELABLE_STATUSES,
  });
});

/**
 * GET /api/constants/payment
 * 결제 수단 조회
 */
router.get("/payment", etagMiddleware(), cacheStrategies.staticData, (_req, res) => {
  res.json({
    provider: PAYMENT_PROVIDER,
  });
});

/**
 * GET /api/constants/validation
 * 폼 검증 규칙 조회
 */
router.get("/validation", etagMiddleware(), cacheStrategies.staticData, (_req, res) => {
  res.json({
    quantity: QUANTITY,
    price: PRICE,
    password: { minLength: PASSWORD.MIN_LENGTH },
    inquiry: INQUIRY,
  });
});

/**
 * GET /api/constants/messages
 * 검증 에러 메시지 조회
 */
router.get("/messages", etagMiddleware(), cacheStrategies.staticData, (_req, res) => {
  res.json({
    validation: VALIDATION_MESSAGES,
  });
});

export default router;

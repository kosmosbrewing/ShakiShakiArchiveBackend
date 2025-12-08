import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        isAdmin: boolean;
      };
    }
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Verify password
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// Middleware to check if user is authenticated
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ message: "인증이 필요합니다" });
  }
}

// Middleware to check if user is admin
export async function isAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "인증이 필요합니다" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: "관리자 권한이 필요합니다" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    };

    next();
  } catch (error) {
    res.status(500).json({ message: "서버 오류가 발생했습니다" });
  }
}

// Populate req.user for authenticated requests
export async function populateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.session && req.session.userId) {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
        };
      }
    }
    next();
  } catch (error) {
    next();
  }
}

// Extend session data type
declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

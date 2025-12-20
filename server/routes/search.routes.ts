// server/routes/search.routes.ts
// 주소 검색 API (카카오 로컬 API 연동)

import { Router } from "express";
import { z } from "zod";

const router = Router();

// 카카오 API 기본 URL
const KAKAO_API_BASE = "https://dapi.kakao.com/v2/local/search";

// 검색 요청 스키마
const addressSearchSchema = z.object({
  query: z.string().min(1, "검색어를 입력해주세요"),
  page: z.coerce.number().min(1).max(45).default(1),
  size: z.coerce.number().min(1).max(30).default(10),
});

// 주소 검색 응답 타입 (클라이언트에 전달할 형태)
interface AddressResult {
  addressName: string; // 전체 주소
  roadAddress: string | null; // 도로명 주소
  jibunAddress: string | null; // 지번 주소
  zonecode: string; // 우편번호
  buildingName: string; // 건물명
  x: string; // 경도
  y: string; // 위도
}

interface SearchResponse {
  results: AddressResult[];
  totalCount: number;
  isEnd: boolean;
}

/**
 * @route GET /api/search/address
 * @desc 카카오 주소 검색 API
 * @access Public
 * @query query - 검색 키워드 (필수)
 * @query page - 페이지 번호 (1-45, 기본값: 1)
 * @query size - 페이지당 결과 수 (1-30, 기본값: 10)
 */
router.get("/address", async (req, res) => {
  try {
    // 환경변수 확인
    const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;
    if (!KAKAO_API_KEY) {
      return res.status(500).json({
        message: "카카오 API 키가 설정되지 않았습니다",
      });
    }

    // 요청 파라미터 검증
    const validationResult = addressSearchSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: validationResult.error.errors[0].message,
      });
    }

    const { query, page, size } = validationResult.data;

    // 카카오 주소 검색 API 호출
    const url = new URL(`${KAKAO_API_BASE}/address.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(size));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `KakaoAK ${KAKAO_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("카카오 API 오류:", response.status, errorText);
      return res.status(response.status).json({
        message: "주소 검색에 실패했습니다",
      });
    }

    const data = await response.json();

    // 응답 데이터 가공 (클라이언트에 필요한 형태로 변환)
    const results: AddressResult[] = data.documents.map((doc: any) => {
      // 도로명 주소 정보
      const road = doc.road_address;
      // 지번 주소 정보
      const jibun = doc.address;

      return {
        addressName: doc.address_name,
        roadAddress: road
          ? `${road.address_name}${road.building_name ? ` (${road.building_name})` : ""}`
          : null,
        jibunAddress: jibun ? jibun.address_name : null,
        zonecode: road?.zone_no || "",
        buildingName: road?.building_name || "",
        x: doc.x,
        y: doc.y,
      };
    });

    const searchResponse: SearchResponse = {
      results,
      totalCount: data.meta.total_count,
      isEnd: data.meta.is_end,
    };

    res.json(searchResponse);
  } catch (error: unknown) {
    console.error("주소 검색 오류:", error);
    const message = error instanceof Error ? error.message : "주소 검색 실패";
    res.status(500).json({ message });
  }
});

/**
 * @route GET /api/search/keyword
 * @desc 카카오 키워드 검색 API (장소명으로 검색)
 * @access Public
 * @query query - 검색 키워드 (필수)
 * @query page - 페이지 번호 (1-45, 기본값: 1)
 * @query size - 페이지당 결과 수 (1-15, 기본값: 10)
 */
router.get("/keyword", async (req, res) => {
  try {
    const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;
    if (!KAKAO_API_KEY) {
      return res.status(500).json({
        message: "카카오 API 키가 설정되지 않았습니다",
      });
    }

    const keywordSearchSchema = z.object({
      query: z.string().min(1, "검색어를 입력해주세요"),
      page: z.coerce.number().min(1).max(45).default(1),
      size: z.coerce.number().min(1).max(15).default(10),
    });

    const validationResult = keywordSearchSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: validationResult.error.errors[0].message,
      });
    }

    const { query, page, size } = validationResult.data;

    const url = new URL(`${KAKAO_API_BASE}/keyword.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(size));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `KakaoAK ${KAKAO_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("카카오 API 오류:", response.status, errorText);
      return res.status(response.status).json({
        message: "장소 검색에 실패했습니다",
      });
    }

    const data = await response.json();

    // 키워드 검색 결과 가공
    const results = data.documents.map((doc: any) => ({
      placeName: doc.place_name,
      addressName: doc.address_name,
      roadAddressName: doc.road_address_name,
      phone: doc.phone,
      categoryName: doc.category_name,
      x: doc.x,
      y: doc.y,
    }));

    res.json({
      results,
      totalCount: data.meta.total_count,
      isEnd: data.meta.is_end,
    });
  } catch (error: unknown) {
    console.error("키워드 검색 오류:", error);
    const message = error instanceof Error ? error.message : "키워드 검색 실패";
    res.status(500).json({ message });
  }
});

export default router;

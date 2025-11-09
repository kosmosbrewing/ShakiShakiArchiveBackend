# ShopHub 디자인 가이드라인

## 디자인 접근 방식
**참고 기반**: Shopify, Coupang, 29CM에서 영감을 받아 한국 쇼핑 경험에 최적화된 전환율 중심 디자인. 시각적 매력과 기능성의 균형을 추구합니다.

## 핵심 디자인 원칙
1. **제품 우선**: 시각적 계층 구조가 제품 이미지와 명확한 CTA를 강조
2. **녹색으로 신뢰 구축**: 전문적인 녹색 색상 체계가 한국 시장에서 신뢰성과 친숙함 제공
3. **효율적인 쇼핑**: 간소화된 네비게이션으로 탐색-구매 과정의 마찰 최소화
4. **한국어 최적화**: 한글 가독성을 위해 특별히 설계된 타이포그래피와 간격

---

## 색상 시스템

**Primary Green**: hsl(142 76% 36%)
- 주요 CTA, 링크, 활성 상태, 성공 메시지
- 주요 액션에 full strength 사용
- 호버 상태: Tint (+20% lightness)
- 눌림 상태: Shade (-15% lightness)

**Neutrals**: 그레이스케일 기반
- 배경: white, gray-50, gray-100
- 테두리: gray-200, gray-300
- 텍스트: gray-900 (제목), gray-700 (본문), gray-500 (메타)

**시맨틱 컬러**:
- Error: 검증, 재고 경고용 빨강
- Warning: 재고 알림용 주황
- Info: 배송, 프로모션 배지용 파랑
- Success: 확인용 녹색 (primary)

**표면 처리**:
- 카드: 흰색 배경에 미묘한 그림자
- 섹션: 시각적 리듬을 위한 흰색과 gray-50 교대
- 오버레이: 반투명 어두운 배경에 backdrop-blur

---

## 타이포그래피 시스템

**Primary Font**: Noto Sans KR (Google Fonts)
- 한글 텍스트 최적화, line-height 증가 (1.7-1.8)
- 다양한 굵기 지원: 400 (Regular), 500 (Medium), 700 (Bold)

**계층 구조**:
- Hero 헤드라인: text-4xl ~ text-6xl, font-bold (프로모션 배너)
- 섹션 제목: text-3xl ~ text-4xl, font-bold (카테고리 헤더, 페이지 제목)
- 상품명: text-lg ~ text-xl, font-medium (목록, 카드)
- 가격: text-xl ~ text-3xl, font-bold (할인 강조)
- 본문 텍스트: text-base, font-normal (설명, 콘텐츠)
- 라벨/메타: text-sm, font-medium (평점, 배송 정보)
- 작은 글씨: text-xs ~ text-sm (법적 고지, 세부 사항)

---

## 레이아웃 시스템

**간격 기본값**: Tailwind 단위 2, 4, 6, 8, 12, 16, 24
- 좁은 간격: gap-2, p-2 (컴팩트한 UI 요소)
- 표준: gap-4, p-4 ~ p-6 (카드, 컴포넌트)
- 넉넉함: py-12, py-16, py-24 (섹션 여백)
- XL 섹션: py-32 (히어로, 주요 구분선)

**그리드 시스템**:
- 상품 그리드: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5
- 카테고리 카드: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- 대시보드 통계: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- 컨테이너: max-w-7xl (메인), max-w-6xl (콘텐츠), max-w-2xl (폼)

**컬럼 간격**: gap-4 (모바일), gap-6 (태블릿), gap-8 (데스크톱)

---

## 컴포넌트 라이브러리

### 네비게이션

**메인 헤더** (sticky, backdrop-blur):
- 왼쪽 로고, 중앙 확장 가능한 검색, 오른쪽 장바구니/계정/위시리스트 아이콘
- 이미지 썸네일과 하위 카테고리 목록이 있는 카테고리 메가메뉴
- 장바구니 카운터 배지 (rounded-full, 녹색 배경, 흰색 텍스트)
- 모바일: 왼쪽 햄버거, 중앙 로고, 오른쪽 장바구니/검색 아이콘

**카테고리 바**: 헤더 아래 가로 스크롤 pills, 활성 상태는 녹색 밑줄

**Breadcrumbs**: text-sm, chevron 구분자, 녹색 링크

### 상품 컴포넌트

**상품 카드**:
- 정사각형 이미지 (aspect-square), rounded-lg
- 할인 배지 (우상단, 녹색 배경)
- 상품명 (최대 2줄, truncate)
- 별점 + 리뷰 수 (text-sm, gray-600)
- 가격 표시: 할인가 (녹색, bold), 정가 (line-through, gray-500)
- 위시리스트 하트 아이콘 (좌상단)
- 호버 시 backdrop-blur 배경의 빠른 추가 버튼 표시

**상품 상세 페이지**:
- 2컬럼 레이아웃: 왼쪽 60% 이미지 갤러리, 오른쪽 40% sticky 상품 정보
- 갤러리: 큰 이미지, 아래 썸네일 스트립 (4-5개 이미지)
- 정보 패널: 이름, 평점/리뷰, 가격, 사이즈/색상 선택기 (rounded 버튼), 수량 선택, 큰 녹색 CTA
- 탭: 상품 정보, 리뷰 (별점 분포 그래프), 배송/교환

**상품 필터** (사이드바):
- 접을 수 있는 카테고리 트리
- 가격 범위 슬라이더 (녹색 강조)
- 평점 필터 (별 아이콘)
- 브랜드 체크박스

### 장바구니

**장바구니 Drawer** (오른쪽 슬라이드인, w-96):
- 아이템 카드: 왼쪽 썸네일, 중앙 정보, 오른쪽 삭제 아이콘
- 수량 조절 (- / 숫자 / +)
- 눈에 띄는 녹색 텍스트로 소계
- 이미지 위에 있을 경우 backdrop-blur가 있는 큰 녹색 체크아웃 버튼
- "계속 쇼핑하기" 텍스트 링크

**장바구니 페이지**:
- 왼쪽 65% 아이템 목록, 오른쪽 35% sticky 주문 요약
- 적용 버튼이 있는 쿠폰 입력 (녹색 outline)
- 배송 임계값 진행 바 (녹색 fill)

### 체크아웃 플로우

**진행 단계**: 장바구니 → 주문/배송 → 결제 → 완료
- 녹색 활성/완료 상태의 가로 스테퍼

**폼 섹션**:
- 단일 컬럼 max-w-2xl
- 입력 필드: p-3, rounded-lg, border-gray-300, focus 녹색 ring
- 섹션 제목이 있는 그룹화된 섹션 (font-bold, mb-4)
- 모바일 요약 accordion, 데스크톱 sticky 사이드바

### 관리자 대시보드

**사이드바 네비게이션** (w-64, border-right):
- Dashboard, 상품 관리, 주문 관리, 고객 관리, 통계
- 녹색 활성 상태 배경 (green/10 opacity)
- Heroicons의 아이콘 (outline 변형)

**대시보드 통계 카드**: 
- 주요 지표가 있는 그리드 레이아웃
- 큰 숫자 (text-3xl, font-bold)
- 추세 지표 (위/아래 화살표, 녹색/빨강)

**데이터 테이블**:
- 줄무늬 행 (gray-50 교대)
- Sticky 헤더
- 행 호버 상태 (gray-100)
- 액션 버튼 (수정/삭제) 우측 정렬
- 녹색 활성 페이지의 페이지네이션 컨트롤

---

## 이미지

**Hero 섹션** (홈페이지):
- 전체 너비 배너 (데스크톱 h-[500px], 모바일 h-80)
- 계절 프로모션 사진: 한국 가정/라이프스타일 환경에서 제품을 보여주는 라이프스타일 이미지
- 여러 슬라이드 회전 (점 표시기가 있는 캐러셀)
- 오버레이: 중앙 정렬된 헤드라인 + 서브텍스트 + backdrop-blur-md가 있는 녹색 CTA 버튼

**상품 이미지**:
- 깨끗한 흰색/회색 배경, 스튜디오 품질
- 일관성을 위한 1:1 종횡비 (정사각형)
- 상세 갤러리의 라이프스타일 컨텍스트 샷
- 호버 줌 기능

**카테고리 배너**:
- 21:9 와이드 종횡비
- 사용 중인 카테고리 제품을 보여주는 라이프스타일 사진
- 대비를 위한 backdrop-blur가 있는 텍스트 오버레이

**일반 가이드라인**:
- 진정한 한국 라이프스타일 사진 사용
- 깨끗하고 밝은 한국 가정 환경에서 제품 표시
- 한국 소비자 기반을 반영하는 다양한 연령대 포함
- 과도하게 채도가 높은 색상 피하기; 전문적인 미학 유지

---

## 인터랙티브 요소

**버튼**:
- Primary (녹색): px-8 py-3, rounded-lg, font-semibold, shadow-sm
- Secondary (outline): border-2 green, px-8 py-3, rounded-lg
- 아이콘 버튼: p-3, rounded-full
- 이미지 위 버튼: 가독성을 위한 backdrop-blur-lg 배경

**폼**:
- 라벨: font-medium mb-2, 필수 별표는 녹색
- 입력: p-3 rounded-lg border-gray-300, focus:ring-2 green
- 선택: 녹색 강조가 있는 커스텀 드롭다운
- 에러 메시지: 필드 아래 text-sm red

**카드**: rounded-lg, shadow-sm, hover:shadow-lg transition, p-6

**배지**: rounded-full px-3 py-1, text-xs font-medium

---

## 반응형 브레이크포인트

Mobile-first: sm:640px md:768px lg:1024px xl:1280px
- 모바일은 카드를 수직으로 쌓고, 데스크톱은 그리드
- 모바일에서는 필터를 drawer에 숨기기
- 네비게이션을 햄버거 메뉴로 축소
- 상품 그리드: 2→3→4→5 컬럼

---

## 아이콘

**Lucide Icons** (또는 Heroicons) 사용:
- 네비게이션: shopping-cart, user-circle, search, menu
- UI: chevron-down, x, star, heart, check, plus/minus
- 관리자: bar-chart, shopping-bag, users, settings

**Vue 통합**:
```vue
<script setup lang="ts">
import { ShoppingCart, User, Search } from 'lucide-vue-next';
</script>

<template>
  <ShoppingCart :size="20" />
</template>
```

---

## 접근성

- 포커스 링: 모든 인터랙티브 요소에 ring-2 ring-green
- 아이콘 전용 버튼에 ARIA 라벨
- 시맨틱 HTML5 구조
- 모든 상호작용에 키보드 네비게이션
- 최소 대비율: 본문 텍스트 4.5:1, 큰 텍스트 3:1
- 폼 라벨이 입력과 올바르게 연결됨

---

## Vue 3 컴포넌트 패턴

### Composition API 사용
```vue
<script setup lang="ts">
import { ref, computed } from 'vue';

// 반응형 상태
const count = ref(0);

// Computed 속성
const doubleCount = computed(() => count.value * 2);

// 함수
function increment() {
  count.value++;
}
</script>
```

### Props와 Emits
```vue
<script setup lang="ts">
interface Props {
  title: string;
  count?: number;
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
});

const emit = defineEmits<{
  increment: [];
  update: [value: number];
}>();
</script>
```

### 재사용 가능한 컴포넌트
- `components/` 폴더에 저장
- TypeScript 타입 정의
- 명확한 props 인터페이스
- Emits로 이벤트 정의
- Slots 적절히 활용

---

## 상태 관리 (Pinia)

```typescript
// stores/cart.ts
import { defineStore } from 'pinia';

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([]);
  
  const totalItems = computed(() => 
    items.value.reduce((sum, item) => sum + item.quantity, 0)
  );
  
  function addItem(product: Product) {
    // ...
  }
  
  return { items, totalItems, addItem };
});
```

---

## 스타일링 베스트 프랙티스

### Tailwind CSS 사용
```vue
<template>
  <button 
    class="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
  >
    버튼
  </button>
</template>
```

### 조건부 클래스
```vue
<template>
  <div :class="[
    'base-classes',
    isActive ? 'bg-primary' : 'bg-secondary',
    { 'font-bold': isBold }
  ]">
    Content
  </div>
</template>
```

### 다크 모드 (향후 추가 시)
```vue
<template>
  <div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
    Content
  </div>
</template>
```

---

## 성능 최적화

1. **Lazy Loading**: 페이지 컴포넌트는 동적 import
   ```typescript
   component: () => import('@/pages/ProductDetail.vue')
   ```

2. **v-memo 사용**: 큰 목록에서 재렌더링 최적화
   ```vue
   <div v-for="item in list" :key="item.id" v-memo="[item.id]">
   ```

3. **Computed 활용**: 계산된 값은 캐싱됨
   ```typescript
   const filteredProducts = computed(() => 
     products.value.filter(p => p.isAvailable)
   );
   ```

---

## 테스트 가능성

- 모든 인터랙티브 요소에 `data-testid` 속성 추가
- 명확하고 설명적인 식별자 사용
  ```vue
  <button data-testid="button-add-to-cart">장바구니 담기</button>
  <input data-testid="input-search" />
  <div data-testid="text-product-name">{{ product.name }}</div>
  ```

---

**버전**: 2.0.0 (Vue 3)  
**마지막 업데이트**: 2025-11-09

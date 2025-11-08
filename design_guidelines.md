# Korean E-Commerce Shopping Mall Design Guidelines

## Design Approach
**Reference-Based**: Inspired by Shopify, Coupang, and 29CM to create a conversion-optimized Korean shopping experience balancing visual appeal with functionality.

## Core Design Principles
1. **Product-First**: Visual hierarchy emphasizes product imagery and prominent CTAs
2. **Trust Through Green**: Professional green color scheme builds credibility and familiarity in Korean market
3. **Efficient Shopping**: Streamlined navigation minimizes friction in browse-to-purchase flow
4. **Korean-Optimized**: Typography and spacing designed specifically for Hangul readability

---

## Color System

**Primary Green**: hsl(142 76% 36%)
- Main CTAs, links, active states, success messages
- Use at full strength for primary actions
- Tint (+20% lightness) for hover states
- Shade (-15% lightness) for pressed states

**Neutrals**: Grayscale foundation
- Backgrounds: white, gray-50, gray-100
- Borders: gray-200, gray-300
- Text: gray-900 (headings), gray-700 (body), gray-500 (meta)

**Semantic Colors**:
- Error: Red for validation, stock warnings
- Warning: Amber for inventory alerts
- Info: Blue for shipping, promotional badges
- Success: Green primary for confirmations

**Surface Treatment**:
- Cards: white backgrounds with subtle shadows
- Sections: alternating white and gray-50 for visual rhythm
- Overlays: backdrop-blur with semi-transparent dark backgrounds

---

## Typography System

**Primary Font**: Noto Sans KR via Google Fonts
- Korean text optimized with increased line-height (1.7-1.8)
- Supports multiple weights: 400 (Regular), 500 (Medium), 700 (Bold)

**Hierarchy**:
- Hero Headlines: text-4xl to text-6xl, font-bold (promotional banners)
- Section Titles: text-3xl to text-4xl, font-bold (category headers, page titles)
- Product Names: text-lg to text-xl, font-medium (listings, cards)
- Prices: text-xl to text-3xl, font-bold (prominence on discounts)
- Body Text: text-base, font-normal (descriptions, content)
- Labels/Meta: text-sm, font-medium (ratings, shipping info)
- Small Print: text-xs to text-sm (legal, fine print)

---

## Layout System

**Spacing Primitives**: Tailwind units 2, 4, 6, 8, 12, 16, 24
- Tight spacing: gap-2, p-2 (compact UI elements)
- Standard: gap-4, p-4 to p-6 (cards, components)
- Generous: py-12, py-16, py-24 (section breathing room)
- XL sections: py-32 (hero, major dividers)

**Grid Systems**:
- Product Grids: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5
- Category Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Dashboard Stats: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Containers: max-w-7xl (main), max-w-6xl (content), max-w-2xl (forms)

**Column Gaps**: gap-4 (mobile), gap-6 (tablet), gap-8 (desktop)

---

## Component Library

### Navigation
**Main Header** (sticky, backdrop-blur):
- Logo left, expandable search center, cart/account/wishlist icons right
- Category mega-menu with image thumbnails and subcategory lists
- Cart counter badge (rounded-full, green background, white text)
- Mobile: hamburger left, logo center, cart/search icons right

**Category Bar**: Horizontal scrolling pills below header with active green underline

**Breadcrumbs**: text-sm with chevron separators, green links

### Product Components

**Product Card**:
- Square image (aspect-square), rounded-lg
- Discount badge (top-right corner, green background)
- Product name (2 lines max, truncate)
- Star rating + review count (text-sm, gray-600)
- Price display: discounted (green, bold), original (line-through, gray-500)
- Wishlist heart icon (top-left)
- Quick add button appears on hover with backdrop-blur background

**Product Detail Page**:
- Two-column layout: Image gallery 60% left, product info 40% right sticky
- Gallery: large image with thumbnail strip below (4-5 images)
- Info panel: name, rating/reviews, price, size/color selectors (rounded buttons), quantity picker, large green CTA
- Tabs: 상품 정보, 리뷰 (별점 분포 그래프), 배송/교환

**Product Filters** (sidebar):
- Collapsible category tree
- Price range slider (green accent)
- Rating filters (star icons)
- Brand checkboxes

### Shopping Cart

**Cart Drawer** (slide-in right, w-96):
- Item cards: thumbnail left, info center, remove icon right
- Quantity controls (- / number / +)
- Subtotal with prominent green text
- Large green checkout button with backdrop-blur if over images
- "계속 쇼핑하기" text link

**Cart Page**:
- Items list 65% left, order summary 35% right sticky
- Coupon input with apply button (green outline)
- Shipping threshold progress bar (green fill)

### Checkout Flow

**Progress Steps**: 장바구니 → 주문/배송 → 결제 → 완료
- Horizontal stepper with green active/complete states

**Form Sections**:
- Single column max-w-2xl
- Input fields: p-3, rounded-lg, border-gray-300, focus green ring
- Grouped sections with section titles (font-bold, mb-4)
- Mobile summary accordion, desktop sticky sidebar

### Admin Dashboard

**Sidebar Navigation** (w-64, border-right):
- Dashboard, 상품 관리, 주문 관리, 고객 관리, 통계
- Green active state background (green/10 opacity)
- Icons from Heroicons (outline variant)

**Dashboard Stats Cards**: 
- Grid layout with key metrics
- Large numbers (text-3xl, font-bold)
- Trend indicators (up/down arrows, green/red)

**Data Tables**:
- Striped rows (gray-50 alternate)
- Sticky header
- Row hover state (gray-100)
- Action buttons (edit/delete) right-aligned
- Pagination controls with green active page

---

## Images

**Hero Section** (Homepage):
- Full-width banner (h-[500px] desktop, h-80 mobile)
- Seasonal promotion photography: lifestyle imagery showing products in aspirational Korean home/lifestyle contexts
- Multiple rotating slides (carousel with dot indicators)
- Overlay: centered headline + subtext + green CTA button with backdrop-blur-md

**Product Images**:
- Clean white/gray backgrounds, studio quality
- 1:1 aspect ratio (square) for consistency
- Lifestyle context shots in detail gallery
- Hover zoom functionality

**Category Banners**:
- 21:9 wide aspect ratio
- Lifestyle photography showing category products in use
- Text overlay with backdrop-blur for contrast

**General Guidelines**:
- Use authentic Korean lifestyle photography
- Show products in clean, well-lit Korean home environments
- Include diverse age ranges reflecting Korean consumer base
- Avoid overly saturated colors; maintain professional aesthetic

---

## Interactive Elements

**Buttons**:
- Primary (green): px-8 py-3, rounded-lg, font-semibold, shadow-sm
- Secondary (outline): border-2 green, px-8 py-3, rounded-lg
- Icon buttons: p-3, rounded-full
- Buttons on images: backdrop-blur-lg background for legibility

**Forms**:
- Labels: font-medium mb-2, required asterisks in green
- Inputs: p-3 rounded-lg border-gray-300, focus:ring-2 green
- Selects: custom dropdown with green accent
- Error messages: text-sm red below field

**Cards**: rounded-lg, shadow-sm, hover:shadow-lg transition, p-6

**Badges**: rounded-full px-3 py-1, text-xs font-medium

---

## Responsive Breakpoints
Mobile-first: sm:640px md:768px lg:1024px xl:1280px
- Stack cards vertically mobile, grid desktop
- Hide filters in drawer on mobile
- Collapse navigation to hamburger menu
- Product grid: 2→3→4→5 columns

---

## Icons
**Heroicons** (outline style) via CDN:
- Navigation: shopping-cart, user-circle, magnifying-glass, bars-3
- UI: chevron-down, x-mark, star, heart, check, plus/minus
- Admin: chart-bar, shopping-bag, users, cog

---

## Accessibility
- Focus rings: ring-2 ring-green on all interactive elements
- ARIA labels for icon-only buttons
- Semantic HTML5 structure
- Keyboard navigation for all interactions
- Min contrast ratios: 4.5:1 body text, 3:1 large text
- Form labels properly associated with inputs
# E-Commerce Shopping Mall Design Guidelines

## Design Approach
**Reference-Based**: Drawing inspiration from Shopify, Amazon, and modern Korean e-commerce platforms (Coupang, 29CM) to create a conversion-optimized shopping experience that balances visual appeal with functionality.

## Core Design Principles
1. **Product-First**: Visual hierarchy emphasizes product imagery and CTAs
2. **Trust & Credibility**: Clean, professional aesthetic builds consumer confidence
3. **Efficient Shopping**: Streamlined navigation and checkout flow minimize friction
4. **Mobile-Responsive**: Optimized for both desktop and mobile shoppers

---

## Typography System

**Font Stack**: Noto Sans KR (Korean) + Inter (English/Numbers) via Google Fonts

**Hierarchy**:
- Hero Headings: 3xl to 5xl, font-bold (48-60px desktop)
- Section Titles: 2xl to 3xl, font-semibold (30-36px)
- Product Names: lg to xl, font-medium (18-24px)
- Body Text: base, font-normal (16px)
- Prices: xl to 2xl, font-bold for emphasis
- Labels/Meta: sm to base, font-medium (14-16px)
- Captions: xs to sm (12-14px)

**Korean Text Consideration**: Slightly larger line-height (1.7-1.8) for readability

---

## Layout System

**Spacing Scale**: Use Tailwind units of 2, 3, 4, 6, 8, 12, 16, 24
- Component padding: p-4 to p-6
- Section spacing: py-12 to py-24
- Card gaps: gap-4 to gap-8
- Element margins: m-2, m-4, m-8

**Grid System**:
- Product grids: grid-cols-2 md:grid-cols-3 lg:grid-cols-4
- Category cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Container max-width: max-w-7xl
- Content areas: max-w-6xl

---

## Component Library

### Navigation
**Header**:
- Sticky top navigation (sticky top-0 z-50)
- Logo (left), search bar (center-expanded), cart/account icons (right)
- Category mega-menu on hover/click
- Shopping cart counter badge on cart icon
- Mobile: Hamburger menu, search icon, logo center, cart right

**Category Navigation**:
- Horizontal scrolling category pills below main nav
- Sidebar category tree for product listing pages

### Product Components

**Product Card** (repeating grid item):
- Square product image (aspect-square)
- Product name (2 lines, truncate)
- Price (prominent, bold)
- Original price (line-through if discounted)
- Discount badge (top-right corner)
- Rating stars + review count
- Quick-add-to-cart button on hover (desktop)
- Subtle shadow on hover (shadow-md)

**Product Detail Layout**:
- Two-column: Image gallery (left, 60%) + Product info (right, 40%)
- Image gallery: Large main image + thumbnail strip below
- Product info: Name, price, rating/reviews, options (size/color), quantity selector, add-to-cart CTA
- Tabs below: Description, Reviews, Shipping Info
- Related products carousel at bottom

### Shopping Cart

**Cart Drawer** (slide-in from right):
- Width: w-96 to w-full (mobile)
- Item list: thumbnail, name, price, quantity +/- controls, remove button
- Subtotal, shipping info
- Primary CTA: "Checkout" button (large, prominent)
- Secondary: "Continue Shopping" link

**Cart Page** (full page):
- Two-column: Cart items (left, 65%) + Order summary (right, 35%, sticky)
- Quantity controls, item removal
- Coupon code input
- Continue shopping / Proceed to checkout buttons

### Checkout Flow

**Multi-Step Layout**:
- Progress indicator (steps: Cart → Shipping → Payment → Confirmation)
- Single column form, max-w-2xl
- Input fields: p-3, rounded-lg, border
- Order summary sidebar (sticky on desktop, accordion on mobile)

### Admin Dashboard

**Layout Structure**:
- Sidebar navigation (left, w-64): dashboard, products, orders, customers, analytics
- Main content area: Header breadcrumb + page content
- Stats cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Data tables: full-width, striped rows, hover states
- Action buttons: grouped top-right of tables

---

## Images

**Hero Section** (Homepage):
- Full-width hero banner (h-96 to h-screen on desktop, h-64 on mobile)
- Seasonal promotion or featured collection imagery
- Centered overlay text with blurred-background CTA button
- Multiple rotating hero slides (carousel)

**Product Images**:
- High-resolution, white/neutral backgrounds
- Aspect ratio: 1:1 (square) or 3:4 (portrait)
- Multiple angles in product detail gallery
- Zoom functionality on hover/click

**Category Banners**:
- Wide aspect ratio (16:9 or 21:9)
- Lifestyle imagery showing products in use

**Placeholder Guidance**: Use lifestyle product photography, clean studio shots, and aspirational imagery that showcases products in context

---

## Interactive Elements

**Buttons**:
- Primary CTA: px-6 to px-8, py-3 to py-4, rounded-lg, font-semibold
- Secondary: outlined style, same padding
- Icon buttons: p-2 to p-3, rounded-full for cart/wishlist
- Buttons on images: backdrop-blur-md for readability

**Forms**:
- Input fields: p-3, rounded-lg, border, focus ring
- Labels: font-medium, mb-2
- Error states: red border, error message below (text-sm)
- Required field indicators: asterisk

**Cards & Panels**:
- rounded-lg to rounded-xl
- shadow-sm default, shadow-lg on hover
- p-4 to p-6 internal padding

**Modals/Dialogs**:
- Centered overlay with backdrop (backdrop-blur-sm)
- max-w-md to max-w-2xl depending on content
- Close button (top-right)

---

## Responsive Behavior

**Breakpoints**:
- Mobile-first approach
- sm: 640px, md: 768px, lg: 1024px, xl: 1280px
- Stack columns on mobile, expand on larger screens
- Hide/show navigation elements appropriately
- Product grid: 2 cols mobile → 3-4 cols desktop

---

## Icons
**Library**: Heroicons (outline and solid variants) via CDN
- Cart, user, search, menu, close icons in navigation
- Star icons for ratings
- Chevrons for dropdowns/accordions
- Check marks for completed steps

---

## Accessibility
- Focus states: ring-2 on all interactive elements
- ARIA labels for icon-only buttons
- Semantic HTML structure
- Keyboard navigation support for all interactive elements
- Form labels properly associated with inputs

---

This design creates a professional, trustworthy e-commerce experience optimized for conversion while maintaining visual appeal and Korean market standards.
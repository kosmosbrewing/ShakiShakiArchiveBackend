import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingBag, Truck, CreditCard, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative h-[500px] md:h-[600px] bg-gradient-to-br from-primary/20 via-accent to-background flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-background/30" />
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="text-hero-title">
            당신이 원하는 모든 것을
            <br />
            <span className="text-primary">ShopHub</span>에서
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-description">
            다양한 카테고리의 상품을 합리적인 가격에 만나보세요.
            빠른 배송과 안전한 결제로 편리한 쇼핑을 경험하세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => window.location.href = "/api/login"}
              className="text-lg px-8 py-6"
              data-testid="button-get-started"
            >
              시작하기
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              className="text-lg px-8 py-6 backdrop-blur-sm"
              data-testid="button-explore"
            >
              상품 둘러보기
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" data-testid="text-features-title">
          왜 ShopHub를 선택해야 할까요?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="text-center" data-testid="card-feature-products">
            <CardHeader>
              <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>다양한 상품</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                수많은 카테고리에서 원하는 상품을 찾아보세요
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center" data-testid="card-feature-delivery">
            <CardHeader>
              <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>빠른 배송</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                신속하고 안전한 배송으로 빠르게 받아보세요
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center" data-testid="card-feature-payment">
            <CardHeader>
              <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>안전한 결제</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Stripe를 통한 안전하고 편리한 결제 시스템
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center" data-testid="card-feature-security">
            <CardHeader>
              <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>고객 보호</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                안전한 개인정보 보호와 환불 보장 정책
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-cta-title">
            지금 바로 시작하세요!
          </h3>
          <p className="text-lg text-muted-foreground mb-8" data-testid="text-cta-description">
            로그인하고 다양한 상품을 만나보세요
          </p>
          <Button
            size="lg"
            onClick={() => window.location.href = "/api/login"}
            className="text-lg px-8 py-6"
            data-testid="button-cta-login"
          >
            로그인하기
          </Button>
        </div>
      </div>

      <footer className="border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-sm text-muted-foreground" data-testid="text-footer">
            © 2024 ShopHub. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import type { CartItem, Product } from "@shared/schema";

type CartItemWithProduct = CartItem & { product: Product };

export default function Checkout() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingPostalCode, setShippingPostalCode] = useState("");

  const { data: cartItems = [], isLoading } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/orders", {
        shippingName,
        shippingPhone,
        shippingAddress,
        shippingPostalCode,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "주문이 완료되었습니다",
        description: "주문 내역에서 확인하실 수 있습니다",
      });
      setTimeout(() => {
        setLocation(`/order/${data.orderId}`);
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "주문 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + parseFloat(item.product.price) * item.quantity,
    0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingName || !shippingPhone || !shippingAddress) {
      toast({
        title: "입력 오류",
        description: "모든 필수 항목을 입력해주세요",
        variant: "destructive",
      });
      return;
    }
    createOrder.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="text-center py-16">
            <CardContent>
              <p className="text-lg text-muted-foreground mb-4">장바구니가 비어있습니다</p>
              <Link href="/">
                <Button>쇼핑 계속하기</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-8" data-testid="text-page-title">
          주문/결제
        </h1>

        <form onSubmit={handleSubmit}>
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>배송 정보</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="shipping-name">받는 사람 *</Label>
                    <Input
                      id="shipping-name"
                      value={shippingName}
                      onChange={(e) => setShippingName(e.target.value)}
                      placeholder="홍길동"
                      required
                      data-testid="input-shipping-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shipping-phone">연락처 *</Label>
                    <Input
                      id="shipping-phone"
                      type="tel"
                      value={shippingPhone}
                      onChange={(e) => setShippingPhone(e.target.value)}
                      placeholder="010-1234-5678"
                      required
                      data-testid="input-shipping-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shipping-postal-code">우편번호</Label>
                    <Input
                      id="shipping-postal-code"
                      value={shippingPostalCode}
                      onChange={(e) => setShippingPostalCode(e.target.value)}
                      placeholder="12345"
                      data-testid="input-shipping-postal-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shipping-address">주소 *</Label>
                    <Input
                      id="shipping-address"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="서울시 강남구 테헤란로 123"
                      required
                      data-testid="input-shipping-address"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>주문 상품</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cartItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 pb-3 border-b last:border-0 last:pb-0"
                      data-testid={`order-item-${item.id}`}
                    >
                      <div className="w-16 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                        {item.product.imageUrl && (
                          <img
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" data-testid={`text-item-name-${item.id}`}>
                          {item.product.name}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-item-quantity-${item.id}`}>
                          수량: {item.quantity}개
                        </p>
                      </div>
                      <p className="font-medium" data-testid={`text-item-total-${item.id}`}>
                        ₩{(parseFloat(item.product.price) * item.quantity).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>결제 금액</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>상품 금액:</span>
                    <span data-testid="text-subtotal">₩{totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>배송비:</span>
                    <span className="text-primary" data-testid="text-shipping">무료</span>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between text-xl font-bold mb-6">
                      <span>총 결제 금액:</span>
                      <span className="text-primary" data-testid="text-total">
                        ₩{totalAmount.toLocaleString()}
                      </span>
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={createOrder.isPending}
                      data-testid="button-place-order"
                    >
                      {createOrder.isPending ? "주문 중..." : "주문하기"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-4">
                      주문 후 관리자 확인 후 배송이 시작됩니다
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

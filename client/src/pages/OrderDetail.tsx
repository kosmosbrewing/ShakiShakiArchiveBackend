import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Truck, CheckCircle, Clock, XCircle, ArrowLeft } from "lucide-react";
import type { Order, OrderItem, Product } from "@shared/schema";

type OrderWithItems = Order & {
  orderItems: (OrderItem & { product: Product })[];
};

const statusConfig = {
  pending_payment: { label: "입금 대기", icon: Clock, variant: "secondary" as const },
  payment_confirmed: { label: "결제 확인", icon: CheckCircle, variant: "default" as const },
  preparing: { label: "배송 준비", icon: Package, variant: "default" as const },
  shipped: { label: "배송 중", icon: Truck, variant: "default" as const },
  delivered: { label: "배송 완료", icon: CheckCircle, variant: "default" as const },
  cancelled: { label: "주문 취소", icon: XCircle, variant: "destructive" as const },
};

export default function OrderDetail() {
  const [, params] = useRoute("/order/:id");
  const orderId = params?.id;

  const { data: order, isLoading } = useQuery<OrderWithItems>({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
  });

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

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="text-center py-16">
            <CardContent>
              <p className="text-lg text-muted-foreground mb-4">주문을 찾을 수 없습니다</p>
              <Link href="/orders">
                <Button>주문 목록으로</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.pending_payment;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/orders">
          <Button variant="ghost" className="mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            주문 목록으로
          </Button>
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-page-title">
            주문 상세
          </h1>
          <Badge variant={statusInfo.variant} className="text-base px-4 py-2" data-testid="badge-order-status">
            <StatusIcon className="h-4 w-4 mr-2" />
            {statusInfo.label}
          </Badge>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>주문 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">주문 번호:</span>
                <span className="font-medium font-mono text-sm" data-testid="text-order-id">{order.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">주문 일시:</span>
                <span data-testid="text-order-date">
                  {new Date(order.createdAt).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {order.trackingNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">운송장 번호:</span>
                  <span className="font-medium" data-testid="text-tracking-number">{order.trackingNumber}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>배송 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">받는 사람:</span>
                <span data-testid="text-shipping-name">{order.shippingName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">연락처:</span>
                <span data-testid="text-shipping-phone">{order.shippingPhone}</span>
              </div>
              {order.shippingPostalCode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">우편번호:</span>
                  <span data-testid="text-shipping-postal-code">{order.shippingPostalCode}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">주소:</span>
                <span className="text-right" data-testid="text-shipping-address">{order.shippingAddress}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>주문 상품</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.orderItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 pb-4 border-b last:border-0 last:pb-0"
                  data-testid={`order-item-${item.id}`}
                >
                  <div className="w-20 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
                    {item.product.imageUrl && (
                      <img
                        src={item.product.imageUrl}
                        alt={item.productName}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium mb-1" data-testid={`text-item-name-${item.id}`}>{item.productName}</p>
                    <p className="text-sm text-muted-foreground" data-testid={`text-item-price-${item.id}`}>
                      ₩{parseInt(item.productPrice).toLocaleString()} × {item.quantity}개
                    </p>
                  </div>
                  <p className="font-medium" data-testid={`text-item-total-${item.id}`}>
                    ₩{(parseFloat(item.productPrice) * item.quantity).toLocaleString()}
                  </p>
                </div>
              ))}
              <div className="pt-4 border-t">
                <div className="flex justify-between text-xl font-bold">
                  <span>총 결제 금액:</span>
                  <span className="text-primary" data-testid="text-total-amount">
                    ₩{parseInt(order.totalAmount).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

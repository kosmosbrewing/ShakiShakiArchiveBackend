import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, Truck, CheckCircle, Clock, XCircle, ShoppingBag } from "lucide-react";
import type { Order } from "@shared/schema";

const statusConfig = {
  pending_payment: { label: "입금 대기", icon: Clock, variant: "secondary" as const },
  payment_confirmed: { label: "결제 확인", icon: CheckCircle, variant: "default" as const },
  preparing: { label: "배송 준비", icon: Package, variant: "default" as const },
  shipped: { label: "배송 중", icon: Truck, variant: "default" as const },
  delivered: { label: "배송 완료", icon: CheckCircle, variant: "default" as const },
  cancelled: { label: "주문 취소", icon: XCircle, variant: "destructive" as const },
};

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="h-32 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-8" data-testid="text-page-title">
          주문 내역
        </h1>

        {orders.length === 0 ? (
          <Card className="text-center py-16" data-testid="empty-orders">
            <CardContent className="space-y-4">
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground" />
              <p className="text-lg text-muted-foreground">주문 내역이 없습니다</p>
              <Link href="/">
                <Button>쇼핑 시작하기</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const statusInfo = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.pending_payment;
              const StatusIcon = statusInfo.icon;

              return (
                <Link key={order.id} href={`/order/${order.id}`}>
                  <Card className="hover-elevate transition-all cursor-pointer" data-testid={`order-card-${order.id}`}>
                    <CardContent className="p-4 md:p-6">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge variant={statusInfo.variant} data-testid={`badge-status-${order.id}`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusInfo.label}
                            </Badge>
                            <span className="text-sm text-muted-foreground" data-testid={`text-date-${order.id}`}>
                              {new Date(order.createdAt).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                          <p className="font-medium text-sm text-muted-foreground mb-1">
                            주문번호: <span className="font-mono" data-testid={`text-order-id-${order.id}`}>{order.id.slice(0, 13)}...</span>
                          </p>
                          <p className="text-sm text-muted-foreground" data-testid={`text-shipping-name-${order.id}`}>
                            받는 사람: {order.shippingName}
                          </p>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-4">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground mb-1">결제 금액</p>
                            <p className="text-xl font-bold text-primary" data-testid={`text-amount-${order.id}`}>
                              ₩{parseInt(order.totalAmount).toLocaleString()}
                            </p>
                          </div>
                          <Button variant="outline" data-testid={`button-view-${order.id}`}>
                            상세보기
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CartItem, Product } from "@shared/schema";

type CartItemWithProduct = CartItem & { product: Product };

export default function Cart() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cartItems = [], isLoading } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
  });

  const updateQuantity = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      await apiRequest("PATCH", `/api/cart/${itemId}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/cart/${itemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "상품이 삭제되었습니다",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + parseFloat(item.product.price) * item.quantity,
    0
  );

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
          장바구니
        </h1>

        {cartItems.length === 0 ? (
          <Card className="text-center py-16" data-testid="empty-cart">
            <CardContent className="space-y-4">
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground" />
              <p className="text-lg text-muted-foreground">장바구니가 비어있습니다</p>
              <Link href="/">
                <Button data-testid="button-continue-shopping">
                  쇼핑 계속하기
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {cartItems.map((item) => (
                <Card key={item.id} data-testid={`cart-item-${item.id}`}>
                  <CardContent className="p-4 md:p-6">
                    <div className="flex gap-4">
                      <div className="w-24 h-24 md:w-32 md:h-32 flex-shrink-0 bg-muted rounded-lg overflow-hidden">
                        {item.product.imageUrl ? (
                          <img
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            className="h-full w-full object-cover"
                            data-testid={`img-cart-item-${item.id}`}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ShoppingBag className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-base md:text-lg mb-2" data-testid={`text-item-name-${item.id}`}>
                          {item.product.name}
                        </h3>
                        <p className="text-lg font-bold text-primary mb-4" data-testid={`text-item-price-${item.id}`}>
                          ₩{parseInt(item.product.price).toLocaleString()}
                        </p>

                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                updateQuantity.mutate({
                                  itemId: item.id,
                                  quantity: Math.max(1, item.quantity - 1),
                                })
                              }
                              disabled={item.quantity <= 1}
                              data-testid={`button-decrease-${item.id}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              max={item.product.stockQuantity}
                              value={item.quantity}
                              onChange={(e) => {
                                const qty = parseInt(e.target.value) || 1;
                                updateQuantity.mutate({ itemId: item.id, quantity: qty });
                              }}
                              className="w-16 text-center h-8"
                              data-testid={`input-quantity-${item.id}`}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                updateQuantity.mutate({
                                  itemId: item.id,
                                  quantity: Math.min(item.product.stockQuantity, item.quantity + 1),
                                })
                              }
                              disabled={item.quantity >= item.product.stockQuantity}
                              data-testid={`button-increase-${item.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem.mutate(item.id)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            삭제
                          </Button>
                        </div>
                      </div>

                      <div className="text-right hidden md:block">
                        <p className="text-lg font-bold" data-testid={`text-item-total-${item.id}`}>
                          ₩{(parseFloat(item.product.price) * item.quantity).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>주문 요약</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-base">
                    <span>상품 개수:</span>
                    <span data-testid="text-item-count">{cartItems.length}개</span>
                  </div>
                  <div className="flex justify-between text-base">
                    <span>총 수량:</span>
                    <span data-testid="text-total-quantity">
                      {cartItems.reduce((sum, item) => sum + item.quantity, 0)}개
                    </span>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between text-xl font-bold mb-6">
                      <span>총 금액:</span>
                      <span className="text-primary" data-testid="text-total-amount">
                        ₩{totalAmount.toLocaleString()}
                      </span>
                    </div>
                    <Link href="/checkout">
                      <Button className="w-full" size="lg" data-testid="button-checkout">
                        결제하기
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

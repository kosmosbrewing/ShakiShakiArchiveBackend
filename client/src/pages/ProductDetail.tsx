import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Package, Minus, Plus, ArrowLeft } from "lucide-react";
import type { Product } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const productId = params?.id;
  const [quantity, setQuantity] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    enabled: !!productId,
  });

  const addToCart = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/cart", {
        productId,
        quantity,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "장바구니에 추가되었습니다",
        description: `${quantity}개 상품이 추가되었습니다`,
      });
      setQuantity(1);
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      window.location.href = "/api/login";
      return;
    }
    addToCart.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="aspect-square bg-muted rounded-lg" />
              <div className="space-y-4">
                <div className="h-8 bg-muted rounded w-3/4" />
                <div className="h-6 bg-muted rounded w-1/2" />
                <div className="h-24 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground">상품을 찾을 수 없습니다</p>
            <Link href="/">
              <Button className="mt-4">홈으로 돌아가기</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const discount = product.originalPrice
    ? Math.round(
        ((parseFloat(product.originalPrice) - parseFloat(product.price)) /
          parseFloat(product.originalPrice)) *
          100
      )
    : 0;

  const isOutOfStock = product.stockQuantity === 0 || !product.isAvailable;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            목록으로
          </Button>
        </Link>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12">
          <div>
            <Card className="overflow-hidden">
              <div className="relative aspect-square bg-muted">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                    data-testid="img-product-main"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-32 w-32 text-muted-foreground" />
                  </div>
                )}
                {discount > 0 && (
                  <Badge className="absolute top-4 right-4 bg-destructive text-destructive-foreground text-lg px-4 py-2" data-testid="badge-discount">
                    {discount}% 할인
                  </Badge>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-product-name">
                {product.name}
              </h1>
              
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-4xl font-bold text-primary" data-testid="text-price">
                  ₩{parseInt(product.price).toLocaleString()}
                </span>
                {product.originalPrice && (
                  <span className="text-xl text-muted-foreground line-through" data-testid="text-original-price">
                    ₩{parseInt(product.originalPrice).toLocaleString()}
                  </span>
                )}
              </div>

              {product.description && (
                <p className="text-base text-foreground leading-relaxed mb-6" data-testid="text-description">
                  {product.description}
                </p>
              )}

              <div className="flex items-center gap-2 mb-6">
                <Badge variant={isOutOfStock ? "destructive" : "secondary"} data-testid="badge-stock">
                  {isOutOfStock ? "품절" : `재고 ${product.stockQuantity}개`}
                </Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">수량:</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    data-testid="button-decrease-quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    max={product.stockQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center"
                    data-testid="input-quantity"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.min(product.stockQuantity, quantity + 1))}
                    disabled={quantity >= product.stockQuantity}
                    data-testid="button-increase-quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-medium">총 금액:</span>
                  <span className="text-2xl font-bold text-primary" data-testid="text-total-price">
                    ₩{(parseInt(product.price) * quantity).toLocaleString()}
                  </span>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    size="lg"
                    onClick={handleAddToCart}
                    disabled={isOutOfStock || addToCart.isPending}
                    data-testid="button-add-to-cart"
                  >
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    {isOutOfStock ? "품절" : "장바구니 담기"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

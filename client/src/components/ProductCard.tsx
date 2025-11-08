import { Link } from "wouter";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package } from "lucide-react";
import type { Product } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const addToCart = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/cart", {
        productId: product.id,
        quantity: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "장바구니에 추가되었습니다",
        description: product.name,
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

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = "/api/login";
      return;
    }
    addToCart.mutate();
  };

  const discount = product.originalPrice
    ? Math.round(
        ((parseFloat(product.originalPrice) - parseFloat(product.price)) /
          parseFloat(product.originalPrice)) *
          100
      )
    : 0;

  const isOutOfStock = product.stockQuantity === 0 || !product.isAvailable;

  return (
    <Link href={`/product/${product.id}`}>
      <Card className="h-full hover-elevate transition-all cursor-pointer" data-testid={`card-product-${product.id}`}>
        <CardContent className="p-0">
          <div className="relative aspect-square overflow-hidden rounded-t-lg bg-muted">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
                data-testid={`img-product-${product.id}`}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-20 w-20 text-muted-foreground" />
              </div>
            )}
            {discount > 0 && (
              <Badge className="absolute top-2 right-2 bg-destructive text-destructive-foreground" data-testid={`badge-discount-${product.id}`}>
                {discount}% OFF
              </Badge>
            )}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <Badge variant="secondary" className="text-lg" data-testid={`badge-outofstock-${product.id}`}>
                  품절
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 p-4">
          <h3 className="font-medium text-base line-clamp-2 min-h-[3rem]" data-testid={`text-name-${product.id}`}>
            {product.name}
          </h3>
          <div className="flex items-center gap-2 w-full">
            <span className="text-xl font-bold text-primary" data-testid={`text-price-${product.id}`}>
              ₩{parseInt(product.price).toLocaleString()}
            </span>
            {product.originalPrice && (
              <span className="text-sm text-muted-foreground line-through" data-testid={`text-original-price-${product.id}`}>
                ₩{parseInt(product.originalPrice).toLocaleString()}
              </span>
            )}
          </div>
          <Button
            className="w-full"
            size="sm"
            onClick={handleAddToCart}
            disabled={isOutOfStock || addToCart.isPending}
            data-testid={`button-add-to-cart-${product.id}`}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {isOutOfStock ? "품절" : "장바구니 담기"}
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}

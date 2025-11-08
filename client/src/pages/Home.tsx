import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Filter } from "lucide-react";
import type { Product, Category } from "@shared/schema";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [localSearchQuery, setLocalSearchQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const search = params.get("search");
    if (search) {
      setSearchQuery(search);
      setLocalSearchQuery(search);
    }
  }, []);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", { search: searchQuery, categoryId: selectedCategory }],
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(localSearchQuery);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-page-title">
            전체 상품
          </h1>
          
          <form onSubmit={handleSearch} className="md:hidden mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="상품 검색..."
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-mobile-search"
              />
            </div>
          </form>

          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2" data-testid="category-filters">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              data-testid="button-category-all"
            >
              전체
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
                data-testid={`button-category-${category.id}`}
              >
                {category.name}
              </Button>
            ))}
          </div>

          {searchQuery && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">검색 결과:</span>
              <Badge variant="secondary" data-testid="badge-search-query">
                {searchQuery}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setLocalSearchQuery("");
                }}
                data-testid="button-clear-search"
              >
                초기화
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16" data-testid="empty-state">
            <p className="text-lg text-muted-foreground mb-4">상품이 없습니다</p>
            {searchQuery && (
              <Button
                onClick={() => {
                  setSearchQuery("");
                  setLocalSearchQuery("");
                }}
              >
                전체 상품 보기
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6" data-testid="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-8" data-testid="text-product-count">
              총 {products.length}개의 상품
            </p>
          </>
        )}
      </div>
    </div>
  );
}

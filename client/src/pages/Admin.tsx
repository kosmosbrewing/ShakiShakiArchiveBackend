import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Package, ShoppingCart, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Product, Category, Order } from "@shared/schema";

const statusConfig = {
  pending_payment: { label: "입금 대기" },
  payment_confirmed: { label: "결제 확인" },
  preparing: { label: "배송 준비" },
  shipped: { label: "배송 중" },
  delivered: { label: "배송 완료" },
  cancelled: { label: "주문 취소" },
};

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("products");

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      window.location.href = "/";
    }
  }, [isAdmin, authLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-48 mb-4" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-8" data-testid="text-page-title">
          관리자 대시보드
        </h1>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="products" data-testid="tab-products">
              <Package className="h-4 w-4 mr-2" />
              상품 관리
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">
              <ShoppingCart className="h-4 w-4 mr-2" />
              주문 관리
            </TabsTrigger>
            <TabsTrigger value="categories" data-testid="tab-categories">
              <Tag className="h-4 w-4 mr-2" />
              카테고리 관리
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <ProductsManagement />
          </TabsContent>

          <TabsContent value="orders">
            <OrdersManagement />
          </TabsContent>

          <TabsContent value="categories">
            <CategoriesManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProductsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/products/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "상품이 삭제되었습니다" });
    },
  });

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">상품 목록</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAdd} data-testid="button-add-product">
              <Plus className="h-4 w-4 mr-2" />
              상품 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <ProductForm
              product={editingProduct}
              categories={categories}
              onSuccess={() => {
                setIsDialogOpen(false);
                setEditingProduct(null);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {products.map((product) => (
          <Card key={product.id} data-testid={`product-card-${product.id}`}>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-muted rounded overflow-hidden flex-shrink-0">
                  {product.imageUrl && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-lg mb-2" data-testid={`text-product-name-${product.id}`}>
                    {product.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-bold text-primary">₩{parseInt(product.price).toLocaleString()}</span>
                    <Badge variant="secondary" data-testid={`badge-stock-${product.id}`}>
                      재고: {product.stockQuantity}
                    </Badge>
                    <Badge variant={product.isAvailable ? "default" : "destructive"}>
                      {product.isAvailable ? "판매중" : "품절"}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(product)}
                    data-testid={`button-edit-${product.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteProduct.mutate(product.id)}
                    data-testid={`button-delete-${product.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProductForm({
  product,
  categories,
  onSuccess,
}: {
  product: Product | null;
  categories: Category[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: product?.name || "",
    slug: product?.slug || "",
    description: product?.description || "",
    price: product?.price || "",
    originalPrice: product?.originalPrice || "",
    categoryId: product?.categoryId || "",
    imageUrl: product?.imageUrl || "",
    stockQuantity: product?.stockQuantity || 0,
    isAvailable: product?.isAvailable ?? true,
  });

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (product) {
        await apiRequest("PATCH", `/api/admin/products/${product.id}`, formData);
      } else {
        await apiRequest("POST", "/api/admin/products", formData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: product ? "상품이 수정되었습니다" : "상품이 추가되었습니다" });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProduct.mutate();
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{product ? "상품 수정" : "상품 추가"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 mt-4">
        <div>
          <Label htmlFor="name">상품명 *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-product-name"
          />
        </div>
        <div>
          <Label htmlFor="slug">URL 슬러그 *</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            placeholder="product-name"
            required
            data-testid="input-product-slug"
          />
        </div>
        <div>
          <Label htmlFor="description">설명</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            data-testid="input-product-description"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="price">판매가 *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
              data-testid="input-product-price"
            />
          </div>
          <div>
            <Label htmlFor="originalPrice">정가</Label>
            <Input
              id="originalPrice"
              type="number"
              step="0.01"
              value={formData.originalPrice}
              onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
              data-testid="input-product-original-price"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="category">카테고리</Label>
          <Select
            value={formData.categoryId}
            onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
          >
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="imageUrl">이미지 URL</Label>
          <Input
            id="imageUrl"
            value={formData.imageUrl}
            onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
            placeholder="https://..."
            data-testid="input-product-image-url"
          />
        </div>
        <div>
          <Label htmlFor="stockQuantity">재고 수량 *</Label>
          <Input
            id="stockQuantity"
            type="number"
            value={formData.stockQuantity}
            onChange={(e) => setFormData({ ...formData, stockQuantity: parseInt(e.target.value) || 0 })}
            required
            data-testid="input-product-stock"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isAvailable"
            checked={formData.isAvailable}
            onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
            className="h-4 w-4"
            data-testid="checkbox-product-available"
          />
          <Label htmlFor="isAvailable" className="cursor-pointer">판매 가능</Label>
        </div>
        <Button type="submit" className="w-full" disabled={saveProduct.isPending} data-testid="button-save-product">
          {saveProduct.isPending ? "저장 중..." : product ? "수정하기" : "추가하기"}
        </Button>
      </div>
    </form>
  );
}

function OrdersManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status, trackingNumber }: { orderId: string; status: string; trackingNumber?: string }) => {
      await apiRequest("PATCH", `/api/admin/orders/${orderId}`, { status, trackingNumber });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "주문 상태가 업데이트되었습니다" });
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">주문 목록</h2>
      <div className="grid gap-4">
        {orders.map((order) => (
          <Card key={order.id} data-testid={`order-card-${order.id}`}>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">주문번호: {order.id.slice(0, 13)}...</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleString('ko-KR')}
                    </p>
                    <p className="text-sm">받는 사람: {order.shippingName}</p>
                    <p className="text-sm">연락처: {order.shippingPhone}</p>
                  </div>
                  <p className="text-lg font-bold text-primary">
                    ₩{parseInt(order.totalAmount).toLocaleString()}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor={`status-${order.id}`}>주문 상태</Label>
                    <Select
                      value={order.status}
                      onValueChange={(value) =>
                        updateOrderStatus.mutate({ orderId: order.id, status: value })
                      }
                    >
                      <SelectTrigger id={`status-${order.id}`} data-testid={`select-status-${order.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusConfig).map(([value, config]) => (
                          <SelectItem key={value} value={value}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor={`tracking-${order.id}`}>운송장 번호</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`tracking-${order.id}`}
                        defaultValue={order.trackingNumber || ""}
                        placeholder="운송장 번호 입력"
                        data-testid={`input-tracking-${order.id}`}
                        onBlur={(e) => {
                          if (e.target.value !== order.trackingNumber) {
                            updateOrderStatus.mutate({
                              orderId: order.id,
                              status: order.status,
                              trackingNumber: e.target.value,
                            });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CategoriesManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/categories/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "카테고리가 삭제되었습니다" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">카테고리 목록</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingCategory(null); setIsDialogOpen(true); }} data-testid="button-add-category">
              <Plus className="h-4 w-4 mr-2" />
              카테고리 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <CategoryForm
              category={editingCategory}
              onSuccess={() => {
                setIsDialogOpen(false);
                setEditingCategory(null);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Card key={category.id} data-testid={`category-card-${category.id}`}>
            <CardHeader>
              <CardTitle>{category.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingCategory(category);
                    setIsDialogOpen(true);
                  }}
                  data-testid={`button-edit-category-${category.id}`}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  수정
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteCategory.mutate(category.id)}
                  data-testid={`button-delete-category-${category.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  삭제
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CategoryForm({
  category,
  onSuccess,
}: {
  category: Category | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: category?.name || "",
    slug: category?.slug || "",
    description: category?.description || "",
  });

  const saveCategory = useMutation({
    mutationFn: async () => {
      if (category) {
        await apiRequest("PATCH", `/api/admin/categories/${category.id}`, formData);
      } else {
        await apiRequest("POST", "/api/admin/categories", formData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: category ? "카테고리가 수정되었습니다" : "카테고리가 추가되었습니다" });
      onSuccess();
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); saveCategory.mutate(); }}>
      <DialogHeader>
        <DialogTitle>{category ? "카테고리 수정" : "카테고리 추가"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 mt-4">
        <div>
          <Label htmlFor="cat-name">카테고리명 *</Label>
          <Input
            id="cat-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-category-name"
          />
        </div>
        <div>
          <Label htmlFor="cat-slug">URL 슬러그 *</Label>
          <Input
            id="cat-slug"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            required
            data-testid="input-category-slug"
          />
        </div>
        <div>
          <Label htmlFor="cat-desc">설명</Label>
          <Textarea
            id="cat-desc"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            data-testid="input-category-description"
          />
        </div>
        <Button type="submit" className="w-full" disabled={saveCategory.isPending} data-testid="button-save-category">
          {saveCategory.isPending ? "저장 중..." : category ? "수정하기" : "추가하기"}
        </Button>
      </div>
    </form>
  );
}

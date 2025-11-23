<script lang="ts" setup>
import { ref } from "vue";

import { useColorMode } from "@vueuse/core";
const mode = useColorMode();
mode.value = "light";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface RouteProps {
  path: string;
  label: string;
}

const routeList: RouteProps[] = [
  {
    path: "/products/all",
    label: "ALL",
  },
  {
    path: "/products/outerwear",
    label: "OUTERWEAR",
  },
  {
    path: "/products/top",
    label: "TOP",
  },
  {
    path: "/products/bottom",
    label: "BOTTOM",
  },
  {
    path: "/products/accessory",
    label: "ACCESSORY",
  },

  {
    path: "/contact",
    label: "CONTACT",
  },

  {
    path: "/instagram",
    label: "INSTAGRAM",
  },

  {
    path: "/about",
    label: "ABOUT",
  },

  {
    path: "/login",
    label: "LOGIN",
  },
  {
    path: "/account",
    label: "ACCOUNT",
  },
  {
    path: "/orders",
    label: "ORDER",
  },
];

const isOpen = ref<boolean>(false);
</script>

<template>
  <header
    :class="{
      'shadow-light': mode === 'light',
      'w-[70%] md:w-[85%] lg:w-[85%] lg:max-w-screen-xl top-5 mx-auto sticky z-40 rounded-2xl flex justify-between items-center p-2 bg-card shadow-md': true,
    }"
    :style="{
      backgroundColor: 'rgba(var(--color-card-rgb, 255, 255, 255), 0.1)',
    }"
  >
    <!-- Mobile -->
    <div class="grid grid-cols-3 items-center lg:hidden">
      <a></a>

      <a href="/" class="flex items-center justify-center">
        <img src="@/icons/logo01.png" alt="Logo" class="h-8 w-18 ml-3 m-1" />
      </a>

      <div class="flex justify-end">
        <Sheet v-model:open="isOpen">
          <SheetTrigger as-child>
            <Menu @click="isOpen = true" class="cursor-pointer" />
          </SheetTrigger>

          <SheetContent
            side="left"
            class="flex flex-col justify-between rounded-tr-2xl rounded-br-2xl bg-card"
          >
            <div>
              <SheetHeader class="mb-4">
                <SheetTitle class="flex items-center">
                  <a href="/" class="flex items-center">
                    <img
                      src="@/icons/logo01.png"
                      alt="Logo"
                      class="h-8 w-18 ml-3 mt-7"
                    />
                  </a>
                </SheetTitle>
              </SheetHeader>

              <div class="flex flex-col gap-2 mt-8">
                <Button
                  v-for="{ path, label } in routeList"
                  :key="label"
                  as-child
                  variant="ghost"
                  class="justify-start text-sm"
                  @click="isOpen = false"
                >
                  <div
                    :class="[
                      'w-full',
                      ['CONTACT', 'LOGIN'].includes(label) ? 'mt-8' : 'mt-0',
                    ]"
                  >
                    <RouterLink :to="path">
                      <span class="block">{{ label }}</span>
                    </RouterLink>
                  </div>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
    <!-- Desktop -->
    <div class="hidden lg:flex items-center">
      <a href="/">
        <img src="@/icons/logo01.png" alt="Logo" class="h-8 w-18 ml-3 m-1" />
      </a>

      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Button
                v-for="{ path, label } in routeList"
                :key="label"
                as-child
                variant="ghost"
                class="justify-start text-sm"
              >
                <RouterLink :to="path"
                  >{{
                    label === "CONTACT" || label === "LOGIN"
                      ? "&nbsp&nbsp&nbsp&nbsp;" + label
                      : label
                  }}
                </RouterLink>
              </Button>
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  </header>
</template>

<style scoped>
.shadow-light {
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.085);
}
</style>

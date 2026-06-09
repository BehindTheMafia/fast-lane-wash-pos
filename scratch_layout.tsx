import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { BUSINESS_LINE_LABELS, type BusinessLine } from "@/lib/businessLine";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/animate-ui/components/radix/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronsUpDown, LogOut, Settings2 } from 'lucide-react';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
  adminOrOwner?: boolean;
  adminOrOwnerOrCajero?: boolean;
  carWashOnly?: boolean;
  barbershopOnly?: boolean;
  barbershopOnlyAdminOrOwner?: boolean;
}

const navItems: NavItem[] = [
  { label: "POS", icon: "fa-cash-register", path: "/pos" },
  { label: "Dashboard", icon: "fa-chart-pie", path: "/dashboard", adminOrOwnerOrCajero: true },
  { label: "Reportes", icon: "fa-file-lines", path: "/reports", adminOrOwner: true },
  { label: "Cierre de Caja", icon: "fa-vault", path: "/cash-close" },
  { label: "Clientes", icon: "fa-users", path: "/customers" },
  { label: "Membresías", icon: "fa-id-card", path: "/memberships", carWashOnly: true },
  { label: "Recordatorios", icon: "fa-bell", path: "/reminders", carWashOnly: true },
  { label: "Inventario", icon: "fa-boxes-stacked", path: "/inventory", barbershopOnlyAdminOrOwner: true },
  { label: "Servicios", icon: "fa-list-check", path: "/services", adminOnly: true },
  { label: "Configuración", icon: "fa-gear", path: "/settings", adminOnly: true },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, loading, user, isAdmin } = useAuth();
  const { businessLine, setBusinessLine, isBarbershop } = useBusinessLine();
  const { data: settings } = useBusinessSettings();
  const isOwner = profile?.role === "owner";
  const location = useLocation();
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <i className="fa-solid fa-spinner fa-spin text-4xl text-accent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const visibleNav = navItems.filter((n) => {
    if (n.carWashOnly && isBarbershop) return false;
    if (n.barbershopOnly && !isBarbershop) return false;
    if (n.barbershopOnlyAdminOrOwner) return isBarbershop && (isAdmin || isOwner);
    if (n.adminOnly) return isAdmin;
    if (n.adminOrOwner) return isAdmin || isOwner;
    if (n.adminOrOwnerOrCajero) return isAdmin || isOwner || profile?.role === "cajero";
    return true;
  });

  const brandName = settings?.business_name || (isBarbershop ? "EL RAPIDO BARBERÍA" : "EL RAPIDO");
  const brandSubtitle = isBarbershop ? "BARBERÍA" : "AUTOLAVADO";
  const headerIcon = isBarbershop ? "fa-scissors" : "fa-car-side";

  const userAvatarFallback = profile?.full_name?.substring(0, 2).toUpperCase() || "US";

  // Breadcrumb generation based on current path
  const currentNav = navItems.find((n) => location.pathname.startsWith(n.path));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <i className={`fa-solid ${headerIcon} text-sm`} />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {brandName}
                      </span>
                      <span className="truncate text-xs">
                        {BUSINESS_LINE_LABELS[businessLine]}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  align="start"
                  side={isMobile ? 'bottom' : 'right'}
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Línea de negocio
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setBusinessLine("car_wash")}
                    className="gap-2 p-2 cursor-pointer"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border">
                      <i className="fa-solid fa-car-side text-xs shrink-0" />
                    </div>
                    {BUSINESS_LINE_LABELS["car_wash"]}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setBusinessLine("barbershop")}
                    className="gap-2 p-2 cursor-pointer"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border">
                      <i className="fa-solid fa-scissors text-xs shrink-0" />
                    </div>
                    {BUSINESS_LINE_LABELS["barbershop"]}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
            <SidebarMenu>
              {visibleNav.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.path} tooltip={item.label}>
                    <Link to={item.path}>
                      <i className={`fa-solid ${item.icon} shrink-0 w-4`} />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage
                        src=""
                        alt={profile?.full_name || "User"}
                      />
                      <AvatarFallback className="rounded-lg">{userAvatarFallback}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {profile?.full_name || "Usuario"}
                      </span>
                      <span className="truncate text-xs capitalize">
                        {profile?.role}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side={isMobile ? 'bottom' : 'right'}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage
                          src=""
                          alt={profile?.full_name || "User"}
                        />
                        <AvatarFallback className="rounded-lg">
                          {userAvatarFallback}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">
                          {profile?.full_name || "Usuario"}
                        </span>
                        <span className="truncate text-xs capitalize">
                          {profile?.role}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link to="/settings">
                        <Settings2 className="mr-2 h-4 w-4" />
                        Configuración
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link to="/dashboard">El Rapido</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {currentNav && (
                  <>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentNav.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto flex items-center px-4">
              <span className="text-xs px-2 py-0.5 rounded-full bg-sidebar-accent/80 text-accent-foreground capitalize">
                {BUSINESS_LINE_LABELS[businessLine]}
              </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-background p-4">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

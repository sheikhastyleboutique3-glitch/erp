import { useQuery } from '@tanstack/react-query';
import api from './api';
import type { ApiResponse, Branch, Category, Unit, Product, Supplier, Alert } from '../types';

function unwrap<T>(res: { data: ApiResponse<T> }): T { return res.data.data; }

export function useBranches() { return useQuery({ queryKey: ['branches'], queryFn: () => api.get<ApiResponse<Branch[]>>('/branches').then(unwrap), staleTime: 10 * 60_000 }); }
export function useCategories() { return useQuery({ queryKey: ['categories'], queryFn: () => api.get<ApiResponse<Category[]>>('/categories').then(unwrap), staleTime: 10 * 60_000 }); }
export function useUnits() { return useQuery({ queryKey: ['units'], queryFn: () => api.get<ApiResponse<Unit[]>>('/units').then(unwrap), staleTime: 10 * 60_000 }); }
export function useProducts(categoryId?: number, search?: string) { return useQuery({ queryKey: ['products', categoryId, search], queryFn: () => api.get<ApiResponse<Product[]>>('/products', { params: { ...(categoryId && { categoryId }), ...(search && { search }) } }).then(unwrap), staleTime: 5 * 60_000 }); }
export function useSuppliers() { return useQuery({ queryKey: ['suppliers'], queryFn: () => api.get<ApiResponse<Supplier[]>>('/suppliers').then(unwrap) }); }
export function useAlerts(branchId?: number, isRead?: boolean) { return useQuery({ queryKey: ['alerts', branchId, isRead], queryFn: () => api.get<ApiResponse<Alert[]>>('/alerts', { params: { ...(branchId && { branchId }), ...(isRead !== undefined && { isRead }) } }).then(unwrap), refetchInterval: 60_000 }); }

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface AuthUser {
    id: string;
    role: string;
    email: string;
    permissions?: Record<string, boolean>;
}

interface AuthContextType {
    user: AuthUser | null;
    loading: boolean;
    isProfileLoading: boolean; // Add this
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [isProfileLoading, setProfileLoading] = useState(false);
    const fetchInProgress = React.useRef<string | null>(null);

    const fetchUserData = async (userId: string, email: string) => {
        if (!userId || fetchInProgress.current === userId) return;
        fetchInProgress.current = userId;
        setProfileLoading(true);

        console.log(`[AuthContext] API fetching profile for ${userId}`);

        try {
            // 获取最新 session 以拿到有效的 JWT Token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/users/me/profile', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`[AuthContext] Profile loaded via API: ${data.role}`);
                setUser({ 
                    id: userId, 
                    email, 
                    role: data.role || 'user',
                    permissions: data.permissions || {}
                });
            } else {
                console.warn(`[AuthContext] API Profile fetch failed (Status: ${response.status}), falling back to metadata.`);
                // 失败时保持现有的 (可能是基于 metadata 的) 用户信息
            }
        } catch (err) {
            console.error("[AuthContext] Catch: Profile fetch failed", err);
        } finally {
            fetchInProgress.current = null;
            setProfileLoading(false);
            setLoading(false);
        }
    };

    useEffect(() => {
        let profileSub: any = null;

        const initAuth = async () => {
            console.log("[AuthContext] Initializing...");
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    // Set a baseline user immediately using metadata role to unblock ProtectedRoute
                    const role = session.user.user_metadata?.role || '';
                    setUser({ id: session.user.id, email: session.user.email || '', role, permissions: {} });
                    
                    // Then fetch the real role and wait for it
                    await fetchUserData(session.user.id, session.user.email || '');
                    setLoading(false);

                    // NOTE: 新增实时监听当前用户的 Profile 变更（如权限调整）
                    profileSub = supabase
                        .channel(`profile-${session.user.id}`)
                        .on('postgres_changes', { 
                            event: 'UPDATE', 
                            schema: 'public', 
                            table: 'users',
                            filter: `id=eq.${session.user.id}`
                        }, () => {
                            console.log("[AuthContext] Profile update detected, re-fetching...");
                            fetchUserData(session.user.id, session.user.email || '');
                        })
                        .subscribe();
                } else {
                    console.log("[AuthContext] No session.");
                    setLoading(false);
                }
            } catch (err) {
                console.error("[AuthContext] Init error", err);
                setLoading(false);
            }
        };

        initAuth();

        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[AuthContext] Event: ${event}`);

            if (session?.user) {
                if (event === 'SIGNED_IN') {
                    // On sign in, give them a baseline user from metadata and unblock
                    const role = session.user.user_metadata?.role || '';
                    setUser({ id: session.user.id, email: session.user.email || '', role, permissions: {} });
                    setLoading(false);

                    // 登录后开启监听
                    if (profileSub) supabase.removeChannel(profileSub);
                    profileSub = supabase
                        .channel(`profile-${session.user.id}`)
                        .on('postgres_changes', { 
                            event: 'UPDATE', 
                            schema: 'public', 
                            table: 'users',
                            filter: `id=eq.${session.user.id}`
                        }, () => fetchUserData(session.user.id, session.user.email || ''))
                        .subscribe();
                }
                fetchUserData(session.user.id, session.user.email || '');
            } else {
                setUser(null);
                setLoading(false);
                if (profileSub) {
                    supabase.removeChannel(profileSub);
                    profileSub = null;
                }
            }
        });

        return () => {
            authSub.unsubscribe();
            if (profileSub) supabase.removeChannel(profileSub);
        };
    }, []);

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, isProfileLoading, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuthContext must be used within an AuthProvider');
    }
    return context;
};

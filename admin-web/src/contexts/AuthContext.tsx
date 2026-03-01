import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface AuthUser {
    id: string;
    role: string;
    email: string;
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

        console.log(`[AuthContext] Background fetching profile for ${userId}`);

        try {
            const { data, error } = await supabase
                .from('users')
                .select('role')
                .eq('id', userId)
                .single();

            if (data && !error) {
                console.log(`[AuthContext] Profile loaded: ${data.role}`);
                setUser({ id: userId, email, role: data.role || 'user' });
            } else {
                console.warn(`[AuthContext] Profile not found or error, defaulting to 'user'.`);
                setUser({ id: userId, email, role: 'user' });
            }
        } catch (err) {
            console.error("[AuthContext] Catch: Profile fetch failed", err);
            setUser(prev => prev ? { ...prev, role: 'user' } : null);
        } finally {
            fetchInProgress.current = null;
            setProfileLoading(false);
            setLoading(false); // Double check loading is false
        }
    };

    useEffect(() => {
        const initAuth = async () => {
            console.log("[AuthContext] Initializing...");
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    console.log("[AuthContext] Session found, unblocking UI early with empty role.");
                    // Set a baseline user immediately to unblock ProtectedRoute
                    setUser({ id: session.user.id, email: session.user.email || '', role: '' });
                    setLoading(false);
                    // Then fetch the real role in background
                    fetchUserData(session.user.id, session.user.email || '');
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

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[AuthContext] Event: ${event}`);

            if (session?.user) {
                if (event === 'SIGNED_IN') {
                    // On sign in, give them a baseline user and unblock
                    setUser({ id: session.user.id, email: session.user.email || '', role: '' });
                    setLoading(false);
                }
                fetchUserData(session.user.id, session.user.email || '');
            } else {
                setUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
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

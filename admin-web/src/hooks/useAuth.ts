import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useAuth = () => {
    const [user, setUser] = useState<{ id: string; role: string; email: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUserData = async (userId: string, email: string) => {
            const { data, error } = await supabase
                .from('users')
                .select('role')
                .eq('id', userId)
                .single();

            if (data && !error) {
                setUser({ id: userId, email, role: data.role });
            } else {
                // 如果在 public.users 找不到，可能是新用户或同步延迟，降级为普通访问或清除 session
                setUser(null);
            }
            setLoading(false);
        };

        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await fetchUserData(session.user.id, session.user.email || '');
            } else {
                setUser(null);
                setLoading(false);
            }
        };

        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                await fetchUserData(session.user.id, session.user.email || '');
            } else {
                setUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const logout = async () => {
        await supabase.auth.signOut();
    };

    return { user, loading, logout };
};

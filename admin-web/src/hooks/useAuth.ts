import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types';

export const useAuth = () => {
    const [user, setUser] = useState<{ id: string; role: string; email: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const metadata = session.user.user_metadata;
                setUser({
                    id: session.user.id,
                    email: session.user.email || '',
                    role: metadata.role || UserRole.ADMIN,
                });
            } else {
                setUser(null);
            }
            setLoading(false);
        };

        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const metadata = session.user.user_metadata;
                setUser({
                    id: session.user.id,
                    email: session.user.email || '',
                    role: metadata.role || UserRole.ADMIN,
                });
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const logout = async () => {
        await supabase.auth.signOut();
    };

    return { user, loading, logout };
};

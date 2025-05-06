import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { SystemRoles } from 'librechat-data-provider';

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuthContext();

    if (!user) {
        console.error('User not found in AdminRoute');
        return <Navigate to="/" replace />;
    }

    if (user.role !== SystemRoles.ADMIN) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

export default AdminRoute;

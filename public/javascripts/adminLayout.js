(() => {
    const body = document.body;
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('adminSidebarBackdrop');
    const toggleButton = document.getElementById('adminSidebarToggle');
    const pageTitleEl = document.getElementById('adminPageTitle');
    const navLinks = Array.from(document.querySelectorAll('.admin-nav-link'));

    if (!sidebar || !pageTitleEl || navLinks.length === 0) {
        return;
    }

    const normalizePath = (path) => {
        if (!path) return '/';
        if (path.length > 1 && path.endsWith('/')) {
            return path.slice(0, -1);
        }
        return path;
    };

    const currentPath = normalizePath(globalThis.location?.pathname || '/');

    const isLinkActive = (href) => {
        const normalizedHref = normalizePath(href);
        if (normalizedHref === '/admin') {
            return currentPath === '/admin';
        }
        return currentPath === normalizedHref || currentPath.startsWith(`${normalizedHref}/`);
    };

    let activeTitle = 'Admin Panel';

    navLinks.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const title = link.dataset.title || 'Admin Panel';
        if (isLinkActive(href)) {
            link.classList.add('active');
            activeTitle = title;
        }
    });

    if (currentPath.startsWith('/admin/users/')) activeTitle = 'User Details';
    if (currentPath.startsWith('/admin/restaurants/')) activeTitle = 'Restaurant Details';
    if (currentPath.startsWith('/admin/ngos/')) activeTitle = 'NGO Details';
    if (currentPath.startsWith('/admin/orders/')) activeTitle = 'Order Details';
    if (currentPath.startsWith('/admin/windowslot')) activeTitle = 'Window Slot';

    pageTitleEl.textContent = activeTitle;

    const openSidebar = () => {
        body.classList.add('sidebar-open');
        if (toggleButton) toggleButton.setAttribute('aria-expanded', 'true');
    };

    const closeSidebar = () => {
        body.classList.remove('sidebar-open');
        if (toggleButton) toggleButton.setAttribute('aria-expanded', 'false');
    };

    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            if (body.classList.contains('sidebar-open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeSidebar);
    }

    navLinks.forEach((link) => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 992) {
                closeSidebar();
            }
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeSidebar();
        }
    });
})();

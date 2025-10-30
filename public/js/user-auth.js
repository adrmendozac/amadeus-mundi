// User Authentication State Management
class UserAuth {
  constructor() {
    this.user = null;
    this.init();
  }

  init() {
    this.checkAuthState();
    this.bindEvents();
  }

  // Check if user is logged in (from localStorage, sessionStorage, or Firebase)
  checkAuthState() {
    // Check localStorage for user data
    const userData = localStorage.getItem('mundi_user');
    if (userData) {
      try {
        this.user = JSON.parse(userData);
        this.showUserMenu();
      } catch (e) {
        console.error('Error parsing user data:', e);
        this.showLoginButton();
      }
    } else {
      this.showLoginButton();
    }
  }

  // Show user menu when logged in
  showUserMenu() {
    const userMenu = document.getElementById('userMenuContainer');
    const loginButton = document.getElementById('loginButton');
    const userName = document.getElementById('userName');

    if (userMenu && loginButton && userName) {
      userMenu.style.display = 'block';
      loginButton.style.display = 'none';
      userName.textContent = this.user?.displayName || this.user?.email || 'Usuario';
    }
  }

  // Show login button when not logged in
  showLoginButton() {
    const userMenu = document.getElementById('userMenuContainer');
    const loginButton = document.getElementById('loginButton');

    if (userMenu && loginButton) {
      userMenu.style.display = 'none';
      loginButton.style.display = 'block';
    }
  }

  // Bind event listeners
  bindEvents() {
    // Help option
    const helpOption = document.getElementById('helpOption');
    if (helpOption) {
      helpOption.addEventListener('click', (e) => {
        e.preventDefault();
        this.showHelp();
      });
    }

    // Logout option
    const logoutOption = document.getElementById('logoutOption');
    if (logoutOption) {
      logoutOption.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    }

    // Login form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
      loginButton.addEventListener('click', (e) => {
        if (this.isLoggedIn()) return;
        e.preventDefault();
        this.showLoginModal();
      });
    }

    // Add click listeners to flight search elements
    this.addFlightSearchListeners();
  }

  // Add click listeners to flight search elements
  addFlightSearchListeners() {
    // Flight search form elements that should trigger login
    const flightSearchElements = [
      'input[name="origin"]',
      'input[name="destination"]', 
      'input[name="departureDate"]',
      'input[name="returnDate"]',
      'select[name="adults"]',
      'button[type="submit"]',
      '.flight-card',
      '.book-flight-btn',
      '.select-flight-btn'
    ];

    flightSearchElements.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        element.addEventListener('click', (e) => {
          if (!this.isLoggedIn()) {
            e.preventDefault();
            e.stopPropagation();
            this.showLoginModal();
          }
        });
      });
    });

    // Also listen for form submissions
    const searchForms = document.querySelectorAll('form');
    searchForms.forEach(form => {
      if (form.closest('#loginModal')) return;
      form.addEventListener('submit', (e) => {
        if (!this.isLoggedIn()) {
          e.preventDefault();
          this.showLoginModal();
        }
      });
    });
  }

  // Show login modal
 showLoginModal() {
  document.querySelector('.search-bg-overlay')?.classList.remove('open');
  document.querySelector('.search-form-popup')?.classList.remove('open');
  const el = document.getElementById('loginModal');
  if (!el || typeof bootstrap === 'undefined') return;
  const modal = bootstrap.Modal.getOrCreateInstance(el);
  modal.show();
}
  // Handle login form submission
  handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    if (!email || !password) {
      alert('Por favor completa todos los campos');
      return;
    }

    this.setLoadingState(true);

    // Simulate login (replace with Firebase Auth)
    setTimeout(() => {
      // For demo purposes, accept any email/password
      const userData = {
        uid: 'user_' + Date.now(),
        email: email,
        displayName: email.split('@')[0],
        photoURL: null
      };

      this.setUser(userData);
      this.setLoadingState(false);
      
      // Close modal
      const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
      if (loginModal) {
        loginModal.hide();
      }

      // Clear form
      document.getElementById('loginForm').reset();

      alert('¡Bienvenido! Has iniciado sesión correctamente.');
    }, 1500);
  }

  // Set loading state for login button
  setLoadingState(loading) {
    const spinner = document.getElementById('loginSpinner');
    const btnText = document.getElementById('loginBtnText');
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (spinner && btnText && submitBtn) {
      if (loading) {
        spinner.classList.remove('d-none');
        btnText.textContent = 'Iniciando sesión...';
        submitBtn.disabled = true;
      } else {
        spinner.classList.add('d-none');
        btnText.textContent = 'Iniciar Sesión';
        submitBtn.disabled = false;
      }
    }
  }

  // Show help modal or redirect
  showHelp() {
    // You can implement a help modal or redirect to help page
    alert('¿En qué podemos ayudarte? Contacta a soporte@munditravels.com');
    // Or redirect to help page:
    // window.location.href = 'help.html';
  }

  // Logout user
  logout() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      // Clear user data
      localStorage.removeItem('mundi_user');
      this.user = null;
      
      // Show login button
      this.showLoginButton();
      
      // Optional: Redirect to home page
      // window.location.href = 'index.html';
      
      console.log('Usuario cerró sesión');
    }
  }

  // Method to set user data (call this when user logs in)
  setUser(userData) {
    this.user = userData;
    localStorage.setItem('mundi_user', JSON.stringify(userData));
    this.showUserMenu();
  }

  // Method to get current user
  getCurrentUser() {
    return this.user;
  }

  // Method to check if user is logged in
  isLoggedIn() {
    return this.user !== null;
  }
}

// Initialize user authentication when page loads
document.addEventListener('DOMContentLoaded', function() {
  window.userAuth = new UserAuth();
});


function onFirebaseLogin(user) {
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email.split('@')[0],
    photoURL: user.photoURL
  };
  window.userAuth.setUser(userData);
}

// When user logs out from Firebase
function onFirebaseLogout() {
  window.userAuth.logout();
}

// Check Firebase auth state
function checkFirebaseAuth() {
  // This should be called when Firebase auth state changes
  // firebase.auth().onAuthStateChanged((user) => {
  //   if (user) {
  //     onFirebaseLogin(user);
  //   } else {
  //     onFirebaseLogout();
  //   }
  // });
}


// Initialize the matrix background when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MatrixBackground();

    // Email copy-to-clipboard and tooltip logic
    const emailLink = document.getElementById('email-link');
    const emailTooltip = document.getElementById('email-tooltip');
    const obfuscatedEmail = 'Bg4aC0IJDAAeCBgbCU8AGA0PKQkBAAACQgIGAw=='; // generated through utils/xor-enc.py
    const xorKey = 'lain';

    function decodeEmail(obf, key) {
        // Double base64 decode
        let b64 = atob(obf);
        // XOR decode
        let email = '';
        for (let i = 0; i < b64.length; i++) {
            email += String.fromCharCode(b64.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return email;
    }
    const emailAddress = decodeEmail(obfuscatedEmail, xorKey);

    if (emailLink && emailTooltip) {
        emailLink.addEventListener('click', function(e) {
            e.preventDefault();
            // Copy email to clipboard
            if (navigator.clipboard) {
                navigator.clipboard.writeText(emailAddress);
            } else {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = emailAddress;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            
            // Position tooltip above email link
            const emailRect = emailLink.getBoundingClientRect();
            const socialLinksRect = emailLink.parentElement.getBoundingClientRect();
            
            const left = emailRect.left - socialLinksRect.left + (emailRect.width / 2);
            const top = emailRect.top - socialLinksRect.top - 10;
            
            emailTooltip.style.left = left + 'px';
            emailTooltip.style.top = top + 'px';
            emailTooltip.style.transform = 'translateX(-50%) translateY(-75%)';
            
            // Show tooltip
            emailTooltip.style.opacity = '1';
            
            // Hide after 1.5s
            setTimeout(() => {
                emailTooltip.style.opacity = '0';
            }, 1500);
        });
    }
});
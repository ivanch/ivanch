document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------
    // Avatar glitch layers — clone the avatar image twice (R + B
    // channel shift clones) so the CSS hover animation has elements
    // to slice/displace. Skipped when the user prefers reduced motion.
    // ----------------------------------------------------------------
    const avatar = document.querySelector('.avatar');
    const avatarImg = avatar && avatar.querySelector('img');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (avatar && avatarImg && !prefersReducedMotion) {
        ['r', 'b'].forEach((channel) => {
            const clone = avatarImg.cloneNode(false);
            clone.classList.add('glitch-layer', channel);
            clone.removeAttribute('alt');
            clone.setAttribute('aria-hidden', 'true');
            avatar.appendChild(clone);
        });
    }

    // ----------------------------------------------------------------
    // Email copy-to-clipboard and tooltip logic
    // ----------------------------------------------------------------
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
        let tooltipTimeout;

        async function copyEmail() {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(emailAddress);
                    return true;
                } catch (error) {
                    // Fall through to the legacy copy path when clipboard permissions fail.
                }
            }

            const textarea = document.createElement('textarea');
            textarea.value = emailAddress;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();

            let copied = false;
            try {
                copied = document.execCommand('copy');
            } catch (error) {
                copied = false;
            }
            document.body.removeChild(textarea);
            return copied;
        }

        emailLink.addEventListener('click', async function(e) {
            e.preventDefault();

            const copied = await copyEmail();
            if (!copied) return;

            // Position tooltip above email link
            const emailRect = emailLink.getBoundingClientRect();
            const socialLinksRect = emailLink.parentElement.getBoundingClientRect();

            const left = emailRect.left - socialLinksRect.left + (emailRect.width / 2);
            const top = emailRect.top - socialLinksRect.top - 10;

            emailTooltip.style.left = left + 'px';
            emailTooltip.style.top = top + 'px';
            emailTooltip.style.transform = 'translateX(-50%) translateY(-75%)';

            // Show tooltip only after the copy operation succeeds.
            emailTooltip.classList.add('is-visible');

            // Hide after 1.5s
            clearTimeout(tooltipTimeout);
            tooltipTimeout = setTimeout(() => {
                emailTooltip.classList.remove('is-visible');
            }, 1500);
        });
    }
});

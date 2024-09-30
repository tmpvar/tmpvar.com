nix-shell -p git magic-wormhole --command "ssh-keygen -t rsa -N '' -f ~/.ssh/id_rsa <<< y && wormhole send ~/.ssh/id_rsa.pub && git clone git@github.com:tmpvar/nixos-dots.git ~/.config"

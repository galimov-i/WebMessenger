package crypto

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"log"
)

// GenerateRSAKeyPair генерирует пару RSA ключей
func GenerateRSAKeyPair(bits int) (*rsa.PrivateKey, *rsa.PublicKey, error) {
	privateKey, err := rsa.GenerateKey(rand.Reader, bits)
	if err != nil {
		return nil, nil, err
	}
	return privateKey, &privateKey.PublicKey, nil
}

// PrivateKeyToBytes преобразует приватный ключ в байты
func PrivateKeyToBytes(privateKey *rsa.PrivateKey) []byte {
	return x509.MarshalPKCS1PrivateKey(privateKey)
}

// PublicKeyToBytes преобразует публичный ключ в байты (формат PKCS#8/SubjectPublicKeyInfo)
func PublicKeyToBytes(publicKey *rsa.PublicKey) []byte {
	// Используем MarshalPKIXPublicKey для создания формата SubjectPublicKeyInfo (PUBLIC KEY)
	// Это совместимо с JavaScript Web Crypto API
	pubBytes, err := x509.MarshalPKIXPublicKey(publicKey)
	if err != nil {
		log.Printf("Error marshaling public key: %v", err)
		return x509.MarshalPKCS1PublicKey(publicKey) // Fallback
	}
	return pubBytes
}

// BytesToPrivateKey преобразует байты в приватный ключ
func BytesToPrivateKey(bytes []byte) (*rsa.PrivateKey, error) {
	return x509.ParsePKCS1PrivateKey(bytes)
}

// BytesToPublicKey преобразует байты в публичный ключ (поддерживает оба формата)
func BytesToPublicKey(bytes []byte) (*rsa.PublicKey, error) {
	// Пробуем сначала ParsePKCS1PublicKey (старый формат)
	pk, err := x509.ParsePKCS1PublicKey(bytes)
	if err == nil {
		return pk, nil
	}

	// Пробуем ParsePKIXPublicKey (новый формат)
	pkix, err := x509.ParsePKIXPublicKey(bytes)
	if err != nil {
		return nil, err
	}

	rsaPub, ok := pkix.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("not an RSA public key")
	}
	return rsaPub, nil
}

// PublicKeyToPEM преобразует публичный ключ в PEM формат
func PublicKeyToPEM(publicKeyBytes []byte) string {
	block := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyBytes,
	}
	pemBytes := pem.EncodeToMemory(block)
	return string(pemBytes)
}

// PrivateKeyToPEM преобразует приватный ключ в PEM формат
func PrivateKeyToPEM(privateKeyBytes []byte) string {
	block := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privateKeyBytes,
	}
	pemBytes := pem.EncodeToMemory(block)
	return string(pemBytes)
}

// PEMToBytes преобразует PEM строку в байты
func PEMToBytes(pemString string) ([]byte, error) {
	block, _ := pem.Decode([]byte(pemString))
	if block == nil {
		return nil, nil
	}
	return block.Bytes, nil
}

// PublicKeyFromPEM преобразует PEM строку в байты публичного ключа
func PublicKeyFromPEM(pemString string) ([]byte, error) {
	block, _ := pem.Decode([]byte(pemString))
	if block == nil {
		return nil, nil
	}
	// Проверяем, что это публичный ключ
	if block.Type != "PUBLIC KEY" && block.Type != "RSA PUBLIC KEY" {
		return nil, nil
	}
	return block.Bytes, nil
}

// Encrypt шифрует данные публичным ключом
func Encrypt(plaintext []byte, publicKey *rsa.PublicKey) ([]byte, error) {
	return rsa.EncryptOAEP(
		nil, // используется SHA-256 по умолчанию
		rand.Reader,
		publicKey,
		plaintext,
		nil, // нет дополнительных данных
	)
}

// Decrypt дешифрует данные приватным ключом
func Decrypt(ciphertext []byte, privateKey *rsa.PrivateKey) ([]byte, error) {
	return rsa.DecryptOAEP(
		nil, // используется SHA-256 по умолчанию
		rand.Reader,
		privateKey,
		ciphertext,
		nil, // нет дополнительных данных
	)
}

// EncryptBase64 шифрует строку и возвращает base64
func EncryptBase64(plaintext string, publicKey *rsa.PublicKey) (string, error) {
	ciphertext, err := Encrypt([]byte(plaintext), publicKey)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptBase64 дешифрует base64 строку
func DecryptBase64(ciphertextBase64 string, privateKey *rsa.PrivateKey) (string, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		return "", err
	}
	plaintext, err := Decrypt(ciphertext, privateKey)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// EncryptBytes шифрует байты публичным ключом
func EncryptBytes(plaintext []byte, publicKeyBytes []byte) ([]byte, error) {
	publicKey, err := BytesToPublicKey(publicKeyBytes)
	if err != nil {
		return nil, err
	}
	return Encrypt(plaintext, publicKey)
}

// DecryptBytes дешифрует байты приватным ключом
func DecryptBytes(ciphertext []byte, privateKeyBytes []byte) ([]byte, error) {
	privateKey, err := BytesToPrivateKey(privateKeyBytes)
	if err != nil {
		return nil, err
	}
	return Decrypt(ciphertext, privateKey)
}

// LogKeyPairInfo логирует информацию о сгенерированной паре ключей
func LogKeyPairInfo(privateKey *rsa.PrivateKey, publicKey *rsa.PublicKey) {
	log.Printf("RSA Key pair generated:")
	log.Printf("  Private key size: %d bits", privateKey.N.BitLen())
	log.Printf("  Public key size: %d bits", publicKey.N.BitLen())
}

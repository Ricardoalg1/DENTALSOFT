package lat.occlus.booking;

/** Separado para que las pruebas no dependan de un tercero. */
interface CaptchaVerifier {
    boolean verify(String token, String clientIp);
}
